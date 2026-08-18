/**
 * Módulo de Marketing (Instagram) para API local.
 * Espelha os contratos do Cloudflare Worker.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  DAILY_PUBLISH_LIMIT,
  DEFAULT_TIMEZONE,
  IG_SCOPES,
  assertTransition,
  canTransition,
  combineCaption,
  distributeSchedule,
  nextBackoffMs,
  publicAccount,
  summarizeContent,
  validateCaption,
  validateFormatMedia,
  isRetryableProviderError,
  GRAPH_API_VERSION,
} from '../shared/marketing.ts'

const GRAPH = () =>
  `https://graph.instagram.com/${process.env.META_GRAPH_VERSION || GRAPH_API_VERSION}`

function nowIso() {
  return new Date().toISOString()
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function canView(role) {
  return ['admin', 'gerente', 'marketing'].includes(role)
}
function canConnect(role) {
  // Alinha com marketing.manage: admin, gerente e marketing conectam o Instagram
  return ['admin', 'gerente', 'marketing'].includes(role)
}
function canPublish(role) {
  return ['admin', 'gerente', 'marketing'].includes(role)
}

function encrypt(plain, key) {
  const k = Buffer.from(key.padEnd(32, '0').slice(0, 32))
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${Buffer.concat([enc, tag]).toString('base64url')}`
}

function decrypt(payload, key) {
  const k = Buffer.from(key.padEnd(32, '0').slice(0, 32))
  const [ivB64, dataB64] = payload.split('.')
  const buf = Buffer.from(dataB64, 'base64url')
  const iv = Buffer.from(ivB64, 'base64url')
  const tag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function detectMedia(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image', ext: 'jpg' }
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { mime: 'image/png', kind: 'image', ext: 'png' }
  }
  if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return { mime: 'video/mp4', kind: 'video', ext: 'mp4' }
  }
  return null
}

function createStore(dataDir) {
  const files = {
    account: path.join(dataDir, 'ig-account.json'),
    media: path.join(dataDir, 'ig-media.json'),
    content: path.join(dataDir, 'ig-content.json'),
    jobs: path.join(dataDir, 'ig-jobs.json'),
    attempts: path.join(dataDir, 'ig-attempts.json'),
    audit: path.join(dataDir, 'ig-audit.json'),
    notifications: path.join(dataDir, 'ig-notifications.json'),
    insights: path.join(dataDir, 'ig-insights.json'),
    oauth: path.join(dataDir, 'ig-oauth-states.json'),
    metaConfig: path.join(dataDir, 'ig-meta-config.json'),
  }
  const mediaDir = path.join(dataDir, 'media')
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })

  return {
    mediaDir,
    getAccount: () => readJson(files.account, null),
    saveAccount: (a) => writeJson(files.account, a),
    listMedia: () => readJson(files.media, []),
    saveMedia: (m) => writeJson(files.media, m),
    listContent: () => readJson(files.content, []),
    saveContent: (c) => writeJson(files.content, c),
    listJobs: () => readJson(files.jobs, []),
    saveJobs: (j) => writeJson(files.jobs, j),
    listAttempts: () => readJson(files.attempts, []),
    saveAttempts: (a) => writeJson(files.attempts, a.slice(0, 500)),
    listAudit: () => readJson(files.audit, []),
    appendAudit: (e) => {
      const all = readJson(files.audit, [])
      all.unshift(e)
      writeJson(files.audit, all.slice(0, 1000))
    },
    listNotifications: () => readJson(files.notifications, []),
    saveNotifications: (n) => writeJson(files.notifications, n.slice(0, 200)),
    listInsights: () => readJson(files.insights, []),
    upsertInsight: (ins) => {
      const all = readJson(files.insights, [])
      const i = all.findIndex((x) => x.contentId === ins.contentId)
      if (i >= 0) all[i] = ins
      else all.push(ins)
      writeJson(files.insights, all)
    },
    putOAuthState: (rec) => {
      const all = readJson(files.oauth, []).filter(
        (s) => new Date(s.expiresAt).getTime() > Date.now(),
      )
      all.push(rec)
      writeJson(files.oauth, all)
    },
    consumeOAuthState: (state) => {
      const all = readJson(files.oauth, [])
      const found = all.find((s) => s.state === state)
      writeJson(
        files.oauth,
        all.filter(
          (s) => s.state !== state && new Date(s.expiresAt).getTime() > Date.now(),
        ),
      )
      if (!found || new Date(found.expiresAt).getTime() < Date.now()) return null
      return found
    },
    getMetaConfig: () => readJson(files.metaConfig, null),
    saveMetaConfig: (c) => writeJson(files.metaConfig, c),
  }
}

async function igFetch(url, init) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = String(data?.error?.code ?? res.status)
    const err = new Error(
      (data?.error?.message || 'Erro Instagram').replace(
        /access_token=[^&\s]+/gi,
        'access_token=***',
      ),
    )
    err.code = code
    err.retryable = isRetryableProviderError(code)
    throw err
  }
  return data
}

async function publishOne(store, item, env, workerId) {
  const account = store.getAccount()
  if (!account || account.status === 'disconnected') {
    item.status = 'PAUSED'
    item.lastErrorMessage = 'Conta desconectada'
    return { ok: false, error: item.lastErrorMessage }
  }
  const jobs = store.listJobs()
  let job = jobs.find(
    (j) =>
      j.contentId === item.id &&
      (j.status === 'pending' || j.status === 'running'),
  )
  if (!job) {
    job = {
      id: crypto.randomUUID(),
      contentId: item.id,
      idempotencyKey: item.idempotencyKey,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: nowIso(),
      lockedAt: null,
      lockOwner: null,
      version: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    jobs.push(job)
  }
  if (
    job.lockOwner &&
    job.lockOwner !== workerId &&
    job.lockedAt &&
    Date.now() - new Date(job.lockedAt).getTime() < 5 * 60 * 1000
  ) {
    return { ok: false, error: 'Já em processamento' }
  }
  job.status = 'running'
  job.lockOwner = workerId
  job.lockedAt = nowIso()
  job.attempts += 1
  store.saveJobs(jobs)

  const attempts = store.listAttempts()
  const attempt = {
    id: crypto.randomUUID(),
    contentId: item.id,
    jobId: job.id,
    startedAt: nowIso(),
    finishedAt: null,
    ok: false,
  }
  attempts.unshift(attempt)
  store.saveAttempts(attempts)

  try {
    if (item.status === 'PUBLISHED') {
      job.status = 'done'
      job.lockOwner = null
      store.saveJobs(jobs)
      attempt.ok = true
      attempt.finishedAt = nowIso()
      store.saveAttempts(attempts)
      return { ok: true }
    }
    if (['SCHEDULED', 'FAILED_RETRYABLE'].includes(item.status)) {
      assertTransition(item.status, 'QUEUED')
      item.status = 'QUEUED'
    }
    assertTransition(item.status, 'PREPARING')
    item.status = 'PREPARING'
    item.attempts = (item.attempts || 0) + 1

    const key = env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET
    let token = decrypt(account.encryptedAccessToken, key)
    const mediaAll = store.listMedia()
    const ordered = item.media
      .sort((a, b) => a.position - b.position)
      .map((r) => mediaAll.find((m) => m.id === r.mediaId))
      .filter(Boolean)
    if (!ordered.length) throw Object.assign(new Error('Mídia ausente'), { code: 'MEDIA', retryable: false })

    const caption = combineCaption(item.caption, item.hashtags)
    const igUserId = account.externalUserId
    let containerId

    const createContainer = async (params) => {
      const body = new URLSearchParams({ ...params, access_token: token })
      const data = await igFetch(`${GRAPH()}/${igUserId}/media`, {
        method: 'POST',
        body,
      })
      return data.id
    }

    const waitReady = async (id) => {
      const started = Date.now()
      while (Date.now() - started < 120000) {
        const st = await igFetch(
          `${GRAPH()}/${id}?fields=status_code&access_token=${encodeURIComponent(token)}`,
        )
        if (st.status_code === 'FINISHED') return
        if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
          throw Object.assign(new Error('Mídia rejeitada'), {
            code: 'MEDIA_ERROR',
            retryable: false,
          })
        }
        await new Promise((r) => setTimeout(r, 2500))
      }
      throw Object.assign(new Error('Timeout mídia'), {
        code: 'TIMEOUT',
        retryable: true,
      })
    }

    if (item.format === 'CAROUSEL') {
      const children = []
      for (const m of ordered) {
        const child = await createContainer(
          m.kind === 'video'
            ? { media_type: 'VIDEO', video_url: m.publicUrl, is_carousel_item: 'true' }
            : { image_url: m.publicUrl, is_carousel_item: 'true' },
        )
        if (m.kind === 'video') {
          item.status = 'PROCESSING_MEDIA'
          await waitReady(child)
        }
        children.push(child)
      }
      containerId = await createContainer({
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption,
      })
    } else if (item.format === 'REEL') {
      containerId = await createContainer({
        media_type: 'REELS',
        video_url: ordered[0].publicUrl,
        caption,
        ...(item.coverUrl ? { cover_url: item.coverUrl } : {}),
      })
      item.status = 'PROCESSING_MEDIA'
      await waitReady(containerId)
    } else if (item.format === 'STORY_IMAGE' || item.format === 'STORY_VIDEO') {
      containerId = await createContainer(
        item.format === 'STORY_VIDEO'
          ? { media_type: 'STORIES', video_url: ordered[0].publicUrl }
          : { media_type: 'STORIES', image_url: ordered[0].publicUrl },
      )
      if (item.format === 'STORY_VIDEO') {
        item.status = 'PROCESSING_MEDIA'
        await waitReady(containerId)
      }
    } else if (item.format === 'FEED_VIDEO') {
      containerId = await createContainer({
        media_type: 'VIDEO',
        video_url: ordered[0].publicUrl,
        caption,
      })
      item.status = 'PROCESSING_MEDIA'
      await waitReady(containerId)
    } else {
      containerId = await createContainer({
        image_url: ordered[0].publicUrl,
        caption,
        ...(item.altText ? { alt_text: item.altText } : {}),
      })
    }

    item.status = 'PUBLISHING'
    item.containerId = containerId
    const pub = await igFetch(`${GRAPH()}/${igUserId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: token,
      }),
    })
    let permalink
    try {
      const meta = await igFetch(
        `${GRAPH()}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      )
      permalink = meta.permalink
    } catch {
      /* optional */
    }
    item.externalId = pub.id
    item.permalink = permalink
    item.publishedAt = nowIso()
    item.status = 'PUBLISHED'
    item.lastErrorCode = undefined
    item.lastErrorMessage = undefined
    item.updatedAt = nowIso()

    job.status = 'done'
    job.lockOwner = null
    store.saveJobs(jobs)
    attempt.ok = true
    attempt.finishedAt = nowIso()
    store.saveAttempts(attempts)
    return { ok: true }
  } catch (e) {
    const retryable = Boolean(e.retryable) && job.attempts < job.maxAttempts
    item.status = retryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT'
    item.lastErrorCode = String(e.code || 'UNKNOWN')
    item.lastErrorMessage = e.message || 'Erro'
    item.updatedAt = nowIso()
    job.status = retryable ? 'pending' : 'failed'
    job.nextRunAt = new Date(Date.now() + nextBackoffMs(job.attempts)).toISOString()
    job.lockOwner = null
    store.saveJobs(jobs)
    attempt.finishedAt = nowIso()
    attempt.errorCode = item.lastErrorCode
    attempt.errorMessage = item.lastErrorMessage
    attempt.retryable = retryable
    store.saveAttempts(attempts)
    if (String(e.code) === '190') {
      account.status = 'expired'
      store.saveAccount(account)
    }
    return { ok: false, error: item.lastErrorMessage }
  }
}

export function createMarketingHandler({ dataDir, publicBaseUrl, env }) {
  const store = createStore(dataDir)
  const adminUrl = (env.ADMIN_APP_URL || 'http://127.0.0.1:5174').replace(/\/$/, '')

  function resolvedMeta() {
    const stored = store.getMetaConfig()
    let appSecret = env.META_APP_SECRET || ''
    if (stored?.encryptedAppSecret) {
      try {
        appSecret = decrypt(
          stored.encryptedAppSecret,
          env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET,
        )
      } catch {
        /* keep env */
      }
    }
    return {
      appId: stored?.appId || env.META_APP_ID || '',
      appSecret,
      redirectUri:
        stored?.redirectUri ||
        env.INSTAGRAM_REDIRECT_URI ||
        `${publicBaseUrl}/oauth/instagram/callback`,
    }
  }

  function configStatus() {
    const meta = resolvedMeta()
    const missing = []
    if (!meta.appId) missing.push('META_APP_ID')
    if (!meta.appSecret) missing.push('META_APP_SECRET')
    if (!meta.redirectUri) missing.push('INSTAGRAM_REDIRECT_URI')
    return {
      configured: missing.length === 0,
      missing,
      scopes: [...IG_SCOPES],
      graphVersion: process.env.META_GRAPH_VERSION || GRAPH_API_VERSION,
      redirectUri: meta.redirectUri || null,
      oauthRedirectToRegister: meta.redirectUri || null,
      appIdMasked: meta.appId
        ? `${meta.appId.slice(0, 4)}…${meta.appId.slice(-4)}`
        : null,
      setupHint:
        'Crie/abra o app em developers.facebook.com → Instagram → Instagram API with Instagram Login.',
      mode: missing.length ? 'missing_config' : 'ready',
    }
  }

  async function processDue() {
    const contents = store.listContent()
    const jobs = store.listJobs()
    const now = Date.now()
    for (const c of contents) {
      if (
        !c.deletedAt &&
        c.status === 'SCHEDULED' &&
        c.scheduledAt &&
        new Date(c.scheduledAt).getTime() <= now
      ) {
        c.status = 'QUEUED'
        c.updatedAt = nowIso()
        if (!jobs.some((j) => j.contentId === c.id && j.status === 'pending')) {
          jobs.push({
            id: crypto.randomUUID(),
            contentId: c.id,
            idempotencyKey: c.idempotencyKey,
            status: 'pending',
            attempts: 0,
            maxAttempts: 5,
            nextRunAt: nowIso(),
            lockedAt: null,
            lockOwner: null,
            version: 0,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })
        }
      }
    }
    store.saveContent(contents)
    store.saveJobs(jobs)
    const due = store
      .listJobs()
      .filter((j) => j.status === 'pending' && new Date(j.nextRunAt).getTime() <= now)
      .slice(0, 5)
    const workerId = `local-${crypto.randomUUID().slice(0, 6)}`
    const results = []
    for (const job of due) {
      const list = store.listContent()
      const idx = list.findIndex((c) => c.id === job.contentId)
      if (idx < 0) continue
      const result = await publishOne(store, list[idx], env, workerId)
      list[idx] = { ...list[idx] }
      store.saveContent(list)
      results.push(result)
    }
    return { processed: results.length, results }
  }

  // tick local a cada 2 min
  const timer = setInterval(() => {
    void processDue().catch(() => {})
  }, 120_000)
  if (typeof timer.unref === 'function') timer.unref()

  return async function handleMarketing(req, res, url, auth, send) {
    const p = url.pathname

    if (req.method === 'GET' && p.startsWith('/marketing/files/')) {
      const name = path.basename(p)
      const file = path.join(store.mediaDir, name)
      if (!file.startsWith(store.mediaDir) || !fs.existsSync(file)) {
        send(404, { error: 'Not found' })
        return true
      }
      const ext = path.extname(file).toLowerCase()
      const type =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'video/mp4'
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' })
      fs.createReadStream(file).pipe(res)
      return true
    }

    if (req.method === 'GET' && p === '/oauth/instagram/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const err = url.searchParams.get('error')
      if (err || !code || !state) {
        res.writeHead(302, {
          Location: `${adminUrl}/?section=marketing&ig=error`,
        })
        res.end()
        return true
      }
      const st = store.consumeOAuthState(state)
      if (!st) {
        res.writeHead(302, {
          Location: `${adminUrl}/?section=marketing&ig=error&reason=state`,
        })
        res.end()
        return true
      }
      try {
        const meta = resolvedMeta()
        const body = new URLSearchParams({
          client_id: meta.appId,
          client_secret: meta.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: meta.redirectUri,
          code,
        })
        const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        const short = await tokenRes.json()
        if (!short.access_token) throw new Error('Falha OAuth')
        let accessToken = short.access_token
        let expiresIn = 3600
        try {
          const long = await igFetch('https://graph.instagram.com/access_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'ig_exchange_token',
              client_secret: meta.appSecret,
              access_token: short.access_token,
            }),
          })
          accessToken = long.access_token
          expiresIn = long.expires_in || 5184000
        } catch {
          /* mantém short-lived */
        }
        const me = await igFetch(
          `${GRAPH()}/me?fields=user_id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
        )
        const existing = store.getAccount()
        const account = {
          id: existing?.id || crypto.randomUUID(),
          provider: 'instagram',
          externalUserId: String(me.user_id || short.user_id),
          username: me.username || '',
          accountType: me.account_type || 'PROFESSIONAL',
          profilePictureUrl: me.profile_picture_url,
          scopes: [...IG_SCOPES],
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          status: 'connected',
          lastSyncedAt: nowIso(),
          encryptedAccessToken: encrypt(
            accessToken,
            env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET,
          ),
          createdAt: existing?.createdAt || nowIso(),
          updatedAt: nowIso(),
        }
        store.saveAccount(account)
        const contents = store.listContent()
        for (const c of contents) {
          if (c.status === 'PAUSED') {
            c.status = c.scheduledAt ? 'SCHEDULED' : 'DRAFT'
            c.updatedAt = nowIso()
          }
        }
        store.saveContent(contents)
        res.writeHead(302, {
          Location: `${adminUrl}/?section=marketing&ig=connected`,
        })
        res.end()
      } catch {
        res.writeHead(302, {
          Location: `${adminUrl}/?section=marketing&ig=error&reason=oauth`,
        })
        res.end()
      }
      return true
    }

    if (
      (p === '/oauth/instagram/start' || p === '/marketing/oauth/url') &&
      req.method === 'GET'
    ) {
      if (!auth) {
        send(401, { ok: false, error: 'Não autenticado' })
        return true
      }
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      const cfg = configStatus()
      if (!cfg.configured) {
        send(503, { ok: false, error: 'Meta não configurada', config: cfg })
        return true
      }
      const meta = resolvedMeta()
      const state = crypto.randomUUID()
      store.putOAuthState({
        state,
        userId: auth.id,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      })
      const params = new URLSearchParams({
        client_id: meta.appId,
        redirect_uri: meta.redirectUri,
        scope: IG_SCOPES.join(','),
        response_type: 'code',
        state,
        enable_fb_login: '0',
        force_authentication: '1',
      })
      const authorizeUrl = `https://www.instagram.com/oauth/authorize?${params}`
      if (p === '/marketing/oauth/url') {
        send(200, { ok: true, url: authorizeUrl })
        return true
      }
      res.writeHead(302, { Location: authorizeUrl })
      res.end()
      return true
    }

    if (p === '/marketing/health' && req.method === 'GET') {
      send(200, { ok: true, instagram: configStatus(), storage: true })
      return true
    }

    if (!p.startsWith('/marketing')) return false
    if (!auth) {
      send(401, { ok: false, error: 'Não autenticado' })
      return true
    }
    if (!canView(auth.role)) {
      send(403, { ok: false, error: 'Sem permissão' })
      return true
    }

    if (p === '/marketing/meta-config' && req.method === 'POST') {
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      const body = await readBody(req)
      const appId = String(body.appId || '').trim()
      const appSecret = String(body.appSecret || '').trim()
      if (!appId || !appSecret) {
        send(400, { ok: false, error: 'Informe App ID e App Secret' })
        return true
      }
      const redirectUri =
        String(body.redirectUri || '').trim() ||
        resolvedMeta().redirectUri
      store.saveMetaConfig({
        appId,
        encryptedAppSecret: encrypt(
          appSecret,
          env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET,
        ),
        redirectUri,
        updatedAt: nowIso(),
        updatedBy: auth.id,
      })
      send(200, { ok: true, config: configStatus() })
      return true
    }

    if (p === '/marketing/account' && req.method === 'GET') {
      send(200, {
        ok: true,
        account: publicAccount(store.getAccount()),
        config: configStatus(),
        limits: null,
        timezone: DEFAULT_TIMEZONE,
      })
      return true
    }

    if (p === '/marketing/account/disconnect' && req.method === 'POST') {
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      const account = store.getAccount()
      if (account) {
        account.status = 'disconnected'
        account.encryptedAccessToken = undefined
        account.updatedAt = nowIso()
        store.saveAccount(account)
        const contents = store.listContent()
        for (const c of contents) {
          if (['SCHEDULED', 'QUEUED'].includes(c.status)) {
            c.status = 'PAUSED'
            c.updatedAt = nowIso()
          }
        }
        store.saveContent(contents)
      }
      send(200, { ok: true })
      return true
    }

    if (p === '/marketing/account/sync' && req.method === 'POST') {
      const account = store.getAccount()
      if (!account?.encryptedAccessToken) {
        send(400, { ok: false, error: 'Sem conta' })
        return true
      }
      try {
        const token = decrypt(
          account.encryptedAccessToken,
          env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET,
        )
        const me = await igFetch(
          `${GRAPH()}/me?fields=user_id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(token)}`,
        )
        account.username = me.username || account.username
        account.profilePictureUrl = me.profile_picture_url
        account.accountType = me.account_type || account.accountType
        account.lastSyncedAt = nowIso()
        account.status = 'connected'
        store.saveAccount(account)
        send(200, { ok: true, account: publicAccount(account) })
      } catch (e) {
        send(400, { ok: false, error: e.message })
      }
      return true
    }

    if (p === '/marketing/summary' && req.method === 'GET') {
      const account = store.getAccount()
      send(200, {
        ok: true,
        summary: summarizeContent(store.listContent()),
        connectionStatus: account?.status || 'disconnected',
      })
      return true
    }

    if (p === '/marketing/notifications' && req.method === 'GET') {
      const notes = store
        .listNotifications()
        .filter((n) => !n.userId || n.userId === auth.id)
      send(200, { ok: true, notifications: notes.slice(0, 50) })
      return true
    }

    if (p === '/marketing/media' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase()
      let items = store.listMedia().filter((m) => !m.deletedAt)
      if (q) {
        items = items.filter(
          (m) =>
            m.storageKey.toLowerCase().includes(q) || m.mime.includes(q),
        )
      }
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      send(200, { ok: true, media: items })
      return true
    }

    if (p === '/marketing/media/upload' && req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks)
      const ctype = req.headers['content-type'] || ''
      let fileBuf
      let filename = 'upload.bin'
      if (ctype.includes('multipart/form-data')) {
        const boundary = ctype.split('boundary=')[1]
        const parts = raw.toString('latin1').split(`--${boundary}`)
        for (const part of parts) {
          if (!part.includes('name="file"')) continue
          const headerEnd = part.indexOf('\r\n\r\n')
          if (headerEnd < 0) continue
          const headers = part.slice(0, headerEnd)
          const nameMatch = headers.match(/filename="([^"]+)"/)
          if (nameMatch) filename = nameMatch[1]
          let body = part.slice(headerEnd + 4)
          if (body.endsWith('\r\n')) body = body.slice(0, -2)
          fileBuf = Buffer.from(body, 'latin1')
          break
        }
      } else {
        fileBuf = raw
      }
      if (!fileBuf?.length) {
        send(400, { ok: false, error: 'Arquivo obrigatório' })
        return true
      }
      const detected = detectMedia(fileBuf)
      if (!detected) {
        send(400, { ok: false, error: 'Tipo não suportado' })
        return true
      }
      const hash = crypto.createHash('sha256').update(fileBuf).digest('hex')
      const existing = store.listMedia().find((m) => m.hash === hash && !m.deletedAt)
      if (existing) {
        send(200, { ok: true, media: existing, deduped: true })
        return true
      }
      const storageKey = `${hash.slice(0, 16)}-${Date.now()}.${detected.ext}`
      fs.writeFileSync(path.join(store.mediaDir, storageKey), fileBuf)
      const publicUrl = `${publicBaseUrl}/marketing/files/${storageKey}`
      const asset = {
        id: crypto.randomUUID(),
        uploaderId: auth.id,
        uploaderName: auth.name,
        storageKey,
        publicUrl,
        mime: detected.mime,
        kind: detected.kind,
        hash,
        size: fileBuf.length,
        thumbnailUrl: detected.kind === 'image' ? publicUrl : undefined,
        validationStatus: 'valid',
        validationErrors: [],
        usedByContentIds: [],
        createdAt: nowIso(),
      }
      const media = store.listMedia()
      media.unshift(asset)
      store.saveMedia(media)
      send(201, { ok: true, media: asset })
      return true
    }

    const mediaDel = p.match(/^\/marketing\/media\/([^/]+)$/)
    if (mediaDel && req.method === 'DELETE') {
      const media = store.listMedia()
      const idx = media.findIndex((m) => m.id === decodeURIComponent(mediaDel[1]))
      if (idx < 0) {
        send(404, { ok: false, error: 'Não encontrado' })
        return true
      }
      if (media[idx].usedByContentIds.length) {
        send(409, {
          ok: false,
          error: 'Arquivo em uso',
          usedBy: media[idx].usedByContentIds,
        })
        return true
      }
      media[idx].deletedAt = nowIso()
      store.saveMedia(media)
      send(200, { ok: true })
      return true
    }

    if (p === '/marketing/content' && req.method === 'GET') {
      const status = url.searchParams.get('status')
      const q = (url.searchParams.get('q') || '').toLowerCase()
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
      const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') || '20'))
      let items = store.listContent().filter((c) => !c.deletedAt)
      if (status && status !== 'ALL') {
        if (status === 'PROCESSING') {
          items = items.filter((c) =>
            ['QUEUED', 'PREPARING', 'PROCESSING_MEDIA', 'PUBLISHING'].includes(c.status),
          )
        } else if (status === 'FAILED') {
          items = items.filter((c) =>
            ['FAILED_RETRYABLE', 'FAILED_PERMANENT'].includes(c.status),
          )
        } else items = items.filter((c) => c.status === status)
      }
      if (q) {
        items = items.filter(
          (c) =>
            c.caption.toLowerCase().includes(q) ||
            c.hashtags.toLowerCase().includes(q),
        )
      }
      items.sort(
        (a, b) =>
          new Date(b.scheduledAt || b.createdAt) -
          new Date(a.scheduledAt || a.createdAt),
      )
      const total = items.length
      const slice = items.slice((page - 1) * pageSize, page * pageSize)
      const media = store.listMedia()
      send(200, {
        ok: true,
        total,
        page,
        pageSize,
        items: slice.map((c) => ({
          ...c,
          mediaDetails: c.media
            .map((r) => media.find((m) => m.id === r.mediaId))
            .filter(Boolean),
        })),
      })
      return true
    }

    if (p === '/marketing/content' && req.method === 'POST') {
      const body = await readBody(req)
      const account = store.getAccount()
      if (!account || account.status === 'disconnected') {
        send(400, { ok: false, error: 'Conecte o Instagram' })
        return true
      }
      const mediaAll = store.listMedia()
      const selected = (body.mediaIds || [])
        .map((id) => mediaAll.find((m) => m.id === id && !m.deletedAt))
        .filter(Boolean)
      const errors = [
        ...validateCaption(body.caption || '', body.hashtags || ''),
        ...validateFormatMedia(
          body.format,
          selected.map((m) => ({
            kind: m.kind,
            mime: m.mime,
            size: m.size,
            durationSec: m.durationSec,
          })),
        ),
      ]
      if (errors.length) {
        send(400, { ok: false, error: errors.join('; '), errors })
        return true
      }
      let status = 'DRAFT'
      let scheduledAt = body.scheduledAt || null
      if (body.publishNow) {
        if (!canPublish(auth.role)) {
          send(403, { ok: false, error: 'Sem permissão' })
          return true
        }
        status = 'QUEUED'
      } else if (scheduledAt) {
        if (!canPublish(auth.role)) {
          send(403, { ok: false, error: 'Sem permissão' })
          return true
        }
        status = 'SCHEDULED'
      }
      const item = {
        id: crypto.randomUUID(),
        accountId: account.id,
        format: body.format,
        caption: body.caption || '',
        hashtags: body.hashtags || '',
        altText: body.altText,
        coverUrl: body.coverUrl,
        internalNote: body.internalNote,
        timezone: body.timezone || DEFAULT_TIMEZONE,
        scheduledAt,
        publishedAt: null,
        status,
        authorId: auth.id,
        authorName: auth.name,
        assigneeId: auth.id,
        assigneeName: auth.name,
        idempotencyKey: crypto.randomUUID(),
        attempts: 0,
        media: selected.map((m, i) => ({ mediaId: m.id, position: i })),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      const contents = store.listContent()
      contents.unshift(item)
      store.saveContent(contents)
      for (const m of selected) m.usedByContentIds.push(item.id)
      store.saveMedia(mediaAll)
      if (status === 'QUEUED' || status === 'SCHEDULED') {
        const jobs = store.listJobs()
        jobs.push({
          id: crypto.randomUUID(),
          contentId: item.id,
          idempotencyKey: item.idempotencyKey,
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          nextRunAt: scheduledAt || nowIso(),
          lockedAt: null,
          lockOwner: null,
          version: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
        store.saveJobs(jobs)
      }
      if (body.publishNow) {
        const result = await publishOne(store, item, env, `api-${auth.id.slice(0, 6)}`)
        const contents2 = store.listContent()
        const idx = contents2.findIndex((c) => c.id === item.id)
        if (idx >= 0) contents2[idx] = item
        store.saveContent(contents2)
        send(201, { ok: result.ok, content: item, publish: result })
        return true
      }
      send(201, { ok: true, content: item })
      return true
    }

    if (p === '/marketing/content/batch' && req.method === 'POST') {
      if (!canPublish(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      const body = await readBody(req)
      const account = store.getAccount()
      if (!account || account.status !== 'connected') {
        send(400, { ok: false, error: 'Conta não conectada' })
        return true
      }
      const items = body.items || []
      if (!items.length || items.length > DAILY_PUBLISH_LIMIT) {
        send(400, { ok: false, error: 'Lote inválido' })
        return true
      }
      const mediaAll = store.listMedia()
      const contents = store.listContent()
      const occupied = contents
        .filter((c) => !c.deletedAt && c.scheduledAt)
        .map((c) => c.scheduledAt)
      const itemErrors = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const m = mediaAll.find((x) => x.id === it.mediaId && !x.deletedAt)
        if (!m) {
          itemErrors.push({ index: i, error: 'Mídia não encontrada' })
          continue
        }
        const errs = [
          ...validateCaption(
            it.caption ?? body.defaultCaption ?? '',
            it.hashtags ?? body.defaultHashtags ?? '',
          ),
          ...validateFormatMedia(it.format, [
            { kind: m.kind, mime: m.mime, size: m.size, durationSec: m.durationSec },
          ]),
        ]
        if (errs.length) itemErrors.push({ index: i, error: errs.join('; ') })
      }
      if (itemErrors.length) {
        send(400, { ok: false, error: 'Itens inválidos', itemErrors })
        return true
      }
      try {
        const rule = {
          ...body.rule,
          timezone: body.rule.timezone || DEFAULT_TIMEZONE,
          manualTimes: items.map((it) => it.scheduledAt || null),
        }
        const schedule = distributeSchedule(items.length, rule, occupied)
        const created = []
        const jobs = store.listJobs()
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const m = mediaAll.find((x) => x.id === it.mediaId)
          const item = {
            id: crypto.randomUUID(),
            accountId: account.id,
            format: it.format,
            caption: it.caption ?? body.defaultCaption ?? '',
            hashtags: it.hashtags ?? body.defaultHashtags ?? '',
            timezone: rule.timezone,
            scheduledAt: schedule[i],
            publishedAt: null,
            status: 'SCHEDULED',
            authorId: auth.id,
            authorName: auth.name,
            assigneeId: auth.id,
            assigneeName: auth.name,
            idempotencyKey: crypto.randomUUID(),
            attempts: 0,
            media: [{ mediaId: m.id, position: 0 }],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          created.push(item)
          contents.unshift(item)
          m.usedByContentIds.push(item.id)
          jobs.push({
            id: crypto.randomUUID(),
            contentId: item.id,
            idempotencyKey: item.idempotencyKey,
            status: 'pending',
            attempts: 0,
            maxAttempts: 5,
            nextRunAt: schedule[i],
            lockedAt: null,
            lockOwner: null,
            version: 0,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          })
        }
        store.saveContent(contents)
        store.saveMedia(mediaAll)
        store.saveJobs(jobs)
        send(201, { ok: true, contents: created, schedule })
      } catch (e) {
        send(400, { ok: false, error: e.message })
      }
      return true
    }

    if (p === '/marketing/schedule/preview' && req.method === 'POST') {
      const body = await readBody(req)
      try {
        const occupied = store
          .listContent()
          .filter((c) => !c.deletedAt && c.scheduledAt)
          .map((c) => c.scheduledAt)
        const schedule = distributeSchedule(
          body.count,
          { ...body.rule, timezone: body.rule.timezone || DEFAULT_TIMEZONE },
          occupied,
        )
        send(200, { ok: true, schedule })
      } catch (e) {
        send(400, { ok: false, error: e.message })
      }
      return true
    }

    if (p === '/marketing/calendar' && req.method === 'GET') {
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      let items = store.listContent().filter((c) => !c.deletedAt && c.scheduledAt)
      if (from) items = items.filter((c) => new Date(c.scheduledAt) >= new Date(from))
      if (to) items = items.filter((c) => new Date(c.scheduledAt) <= new Date(to))
      const media = store.listMedia()
      send(200, {
        ok: true,
        timezone: DEFAULT_TIMEZONE,
        items: items.map((c) => ({
          ...c,
          thumb:
            media.find((m) => m.id === c.media[0]?.mediaId)?.thumbnailUrl ||
            media.find((m) => m.id === c.media[0]?.mediaId)?.publicUrl,
        })),
      })
      return true
    }

    if (p === '/marketing/jobs/process' && req.method === 'POST') {
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      const result = await processDue()
      send(200, { ok: true, ...result })
      return true
    }

    if (p === '/marketing/jobs' && req.method === 'GET') {
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      send(200, { ok: true, jobs: store.listJobs() })
      return true
    }

    if (p === '/marketing/audit' && req.method === 'GET') {
      if (!canConnect(auth.role)) {
        send(403, { ok: false, error: 'Sem permissão' })
        return true
      }
      send(200, { ok: true, logs: store.listAudit().slice(0, 200) })
      return true
    }

    if (p === '/marketing/content/bulk' && req.method === 'POST') {
      const body = await readBody(req)
      const contents = store.listContent()
      let count = 0
      for (const id of body.ids || []) {
        const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
        if (idx < 0) continue
        if (body.action === 'cancel' && canTransition(contents[idx].status, 'CANCELLED')) {
          contents[idx].status = 'CANCELLED'
          count++
        } else if (body.action === 'delete_drafts' && contents[idx].status === 'DRAFT') {
          contents[idx].deletedAt = nowIso()
          count++
        } else if (body.action === 'reschedule' && body.scheduledAt) {
          contents[idx].scheduledAt = body.scheduledAt
          if (contents[idx].status === 'DRAFT') contents[idx].status = 'SCHEDULED'
          count++
        }
      }
      store.saveContent(contents)
      send(200, { ok: true, count })
      return true
    }

    const cm = p.match(/^\/marketing\/content\/([^/]+)(?:\/([^/]+))?$/)
    if (cm) {
      const id = decodeURIComponent(cm[1])
      const action = cm[2]
      const contents = store.listContent()
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)

      if (!action && req.method === 'GET') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        const item = contents[idx]
        const media = store.listMedia()
        send(200, {
          ok: true,
          content: item,
          media: item.media.map((r) => media.find((m) => m.id === r.mediaId)).filter(Boolean),
          attempts: store.listAttempts().filter((a) => a.contentId === id),
          insights: store.listInsights().find((i) => i.contentId === id) || null,
        })
        return true
      }

      if (!action && req.method === 'PATCH') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        const body = await readBody(req)
        const item = contents[idx]
        if (typeof body.caption === 'string') item.caption = body.caption
        if (typeof body.hashtags === 'string') item.hashtags = body.hashtags
        if (body.scheduledAt !== undefined) {
          item.scheduledAt = body.scheduledAt
          if (item.status === 'DRAFT' && item.scheduledAt) item.status = 'SCHEDULED'
        }
        if (body.mediaIds) {
          item.media = body.mediaIds.map((mediaId, position) => ({ mediaId, position }))
        }
        item.updatedAt = nowIso()
        store.saveContent(contents)
        send(200, { ok: true, content: item })
        return true
      }

      if (action === 'duplicate' && req.method === 'POST') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        const copy = {
          ...structuredClone(contents[idx]),
          id: crypto.randomUUID(),
          status: 'DRAFT',
          scheduledAt: null,
          publishedAt: null,
          externalId: undefined,
          permalink: undefined,
          idempotencyKey: crypto.randomUUID(),
          attempts: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        contents.unshift(copy)
        store.saveContent(contents)
        send(201, { ok: true, content: copy })
        return true
      }

      if (action === 'cancel' && req.method === 'POST') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        if (!canTransition(contents[idx].status, 'CANCELLED')) {
          send(409, { ok: false, error: 'Não cancelável' })
          return true
        }
        contents[idx].status = 'CANCELLED'
        contents[idx].updatedAt = nowIso()
        store.saveContent(contents)
        send(200, { ok: true, content: contents[idx] })
        return true
      }

      if ((action === 'retry' || action === 'publish') && req.method === 'POST') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        contents[idx].status = 'QUEUED'
        contents[idx].updatedAt = nowIso()
        const result = await publishOne(
          store,
          contents[idx],
          env,
          `${action}-${auth.id.slice(0, 6)}`,
        )
        store.saveContent(contents)
        send(200, { ok: result.ok, content: contents[idx], publish: result })
        return true
      }

      if (!action && req.method === 'DELETE') {
        if (idx < 0) {
          send(404, { ok: false, error: 'Não encontrado' })
          return true
        }
        if (!['DRAFT', 'CANCELLED'].includes(contents[idx].status)) {
          send(409, { ok: false, error: 'Só rascunhos/cancelados' })
          return true
        }
        contents[idx].deletedAt = nowIso()
        store.saveContent(contents)
        send(200, { ok: true })
        return true
      }
    }

    send(404, { ok: false, error: 'Rota marketing não encontrada' })
    return true
  }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}
