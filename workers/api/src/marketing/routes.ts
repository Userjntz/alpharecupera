import {
  DAILY_PUBLISH_LIMIT,
  DEFAULT_TIMEZONE,
  assertTransition,
  canTransition,
  distributeSchedule,
  publicAccount,
  summarizeContent,
  validateCaption,
  validateFormatMedia,
  type BatchItemInput,
  type ContentFormat,
  type ContentItem,
  type ContentStatus,
  type MediaAsset,
  type ScheduleRuleInput,
  type SocialAccount,
} from '../../../../shared/marketing'
import { decryptSecret, encryptSecret } from './crypto'
import { InstagramProvider, isProviderError } from './instagram'
import {
  detectMedia,
  maxSizeFor,
  sha256Hex,
  uploadToR2,
  type R2Like,
} from './media'
import { processDueJobs, publishContentItem } from './publisher'
import type { MarketingKv } from './store'
import {
  appendAudit,
  consumeOAuthState,
  getAccount,
  getMetaConfig,
  listAttempts,
  listAudit,
  listContent,
  listInsights,
  listJobs,
  listMedia,
  listNotifications,
  listWebhooks,
  putOAuthState,
  saveAccount,
  saveContent,
  saveJobs,
  saveMedia,
  saveMetaConfig,
  saveNotifications,
  saveWebhooks,
  upsertInsight,
} from './store'

export type MarketingEnv = {
  LEADS_KV: MarketingKv
  MEDIA_R2?: R2Like
  JWT_SECRET: string
  TOKEN_ENCRYPTION_KEY?: string
  META_APP_ID?: string
  META_APP_SECRET?: string
  INSTAGRAM_REDIRECT_URI?: string
  META_GRAPH_VERSION?: string
  MEDIA_PUBLIC_BASE_URL?: string
  PUBLIC_API_URL?: string
  ADMIN_APP_URL?: string
  META_WEBHOOK_VERIFY_TOKEN?: string
}

type AuthUser = {
  id: string
  email: string
  name: string
  role: string
}

type JsonFn = (
  data: unknown,
  status?: number,
  origin?: string | null,
) => Response

function canViewMarketing(role: string) {
  return ['admin', 'gerente', 'marketing'].includes(role)
}

function canManageConnection(role: string) {
  // Alinha com marketing.manage: admin, gerente e marketing conectam o Instagram
  return ['admin', 'gerente', 'marketing'].includes(role)
}

function canPublish(role: string) {
  return ['admin', 'gerente', 'marketing'].includes(role)
}

function canEditDrafts(role: string) {
  return ['admin', 'gerente', 'marketing'].includes(role)
}

function encryptionKey(env: MarketingEnv) {
  return env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET
}

function nowIso() {
  return new Date().toISOString()
}

async function resolveProviderEnv(kv: MarketingKv, env: MarketingEnv) {
  const stored = await getMetaConfig(kv)
  let appSecret = env.META_APP_SECRET || ''
  if (stored?.encryptedAppSecret) {
    try {
      appSecret = await decryptSecret(
        stored.encryptedAppSecret,
        encryptionKey(env),
      )
    } catch {
      /* mantém env */
    }
  }
  const requestUrlHost = env.INSTAGRAM_REDIRECT_URI || ''
  return {
    META_APP_ID: stored?.appId || env.META_APP_ID || '',
    META_APP_SECRET: appSecret,
    INSTAGRAM_REDIRECT_URI:
      stored?.redirectUri ||
      env.INSTAGRAM_REDIRECT_URI ||
      requestUrlHost,
    META_GRAPH_VERSION: env.META_GRAPH_VERSION,
  }
}

async function audit(
  kv: MarketingKv,
  user: AuthUser,
  action: string,
  objectType: string,
  objectId: string,
  meta?: Record<string, unknown>,
) {
  await appendAudit(kv, {
    id: crypto.randomUUID(),
    actorId: user.id,
    actorName: user.name,
    action,
    objectType,
    objectId,
    meta,
    createdAt: nowIso(),
  })
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } })
}

function redirectToAdmin(url: string) {
  // Webviews do Instagram costumam engolir 302 cross-site — usamos 200 + meta/js + link.
  const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="0;url=${safe}"/>
  <title>Voltando ao painel…</title>
  <style>
    body{font-family:system-ui,sans-serif;padding:32px;max-width:420px;margin:40px auto;text-align:center;color:#111}
    a{display:inline-block;margin-top:16px;background:linear-gradient(135deg,#ff6a00,#ffb732);color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700}
  </style>
</head>
<body>
  <p><strong>Login do Instagram concluído.</strong></p>
  <p>Se não voltar sozinho, toque no botão:</p>
  <p><a href="${safe}">Abrir painel Alpha Recupera</a></p>
  <script>setTimeout(function(){location.replace(${JSON.stringify(url)})},50)</script>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

async function saveOAuthLastError(kv: MarketingKv, reason: string) {
  try {
    await kv.put(
      'ig:oauth_last_error',
      JSON.stringify({ reason, at: new Date().toISOString() }),
      { expirationTtl: 60 * 60 * 24 },
    )
  } catch {
    /* ignore */
  }
}

export async function handleMarketingRequest(opts: {
  req: Request
  env: MarketingEnv
  url: URL
  origin: string | null
  auth: AuthUser | null
  json: JsonFn
  requireAuth: () => Promise<AuthUser | Response>
}): Promise<Response | null> {
  const { req, env, url, origin, json } = opts
  const path = url.pathname
  if (!path.startsWith('/marketing') && !path.startsWith('/oauth/instagram')) {
    return null
  }
  const kv = env.LEADS_KV
  const igEnv = await resolveProviderEnv(kv, env)
  // Fallback do redirect para o host atual da API se não configurado
  if (!igEnv.INSTAGRAM_REDIRECT_URI) {
    igEnv.INSTAGRAM_REDIRECT_URI = `${url.origin}/oauth/instagram/callback`
  }
  const provider = new InstagramProvider(igEnv)
  const adminUrl = (env.ADMIN_APP_URL || 'http://127.0.0.1:5174').replace(
    /\/$/,
    '',
  )

  // Health marketing
  if (req.method === 'GET' && path === '/marketing/health') {
    return json(
      {
        ok: true,
        instagram: provider.configStatus(),
        storage: Boolean(env.MEDIA_R2 || true),
      },
      200,
      origin,
    )
  }

  // Proxy público de mídia (Instagram precisa baixar a URL sem auth)
  const mediaFile = path.match(/^\/marketing\/media\/file\/([^/]+)$/)
  if (mediaFile && req.method === 'GET') {
    const id = decodeURIComponent(mediaFile[1])
    const asset = (await listMedia(kv)).find((m) => m.id === id && !m.deletedAt)
    if (!asset) {
      return json({ ok: false, error: 'Mídia não encontrada' }, 404, origin)
    }
    try {
      if (asset.storageKey.startsWith('kv:')) {
        const bin = await kv.get(asset.storageKey, 'arrayBuffer')
        if (!bin) {
          return json({ ok: false, error: 'Arquivo expirado ou ausente' }, 404, origin)
        }
        return new Response(bin, {
          status: 200,
          headers: {
            'Content-Type': asset.mime || 'application/octet-stream',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      if (env.MEDIA_R2) {
        const obj = await (env.MEDIA_R2 as {
          get: (k: string) => Promise<{
            body: ReadableStream | null
            httpMetadata?: { contentType?: string }
          } | null>
        }).get(asset.storageKey)
        if (!obj?.body) {
          return json({ ok: false, error: 'Arquivo ausente no storage' }, 404, origin)
        }
        return new Response(obj.body, {
          status: 200,
          headers: {
            'Content-Type':
              obj.httpMetadata?.contentType || asset.mime || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      return json({ ok: false, error: 'Storage indisponível' }, 503, origin)
    } catch (e) {
      return json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha ao servir mídia',
        },
        500,
        origin,
      )
    }
  }

  // Webhook verification (público)
  if (req.method === 'GET' && path === '/marketing/webhooks/instagram') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (
      mode === 'subscribe' &&
      token &&
      env.META_WEBHOOK_VERIFY_TOKEN &&
      token === env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      return new Response(challenge || '', { status: 200 })
    }
    return json({ ok: false, error: 'Forbidden' }, 403, origin)
  }

  if (req.method === 'POST' && path === '/marketing/webhooks/instagram') {
    try {
      const body = (await req.json()) as { entry?: unknown[] }
      const events = await listWebhooks(kv)
      const id = crypto.randomUUID()
      events.unshift({
        id,
        externalId: id,
        processed: true,
        createdAt: nowIso(),
        payloadSummary: `entries=${Array.isArray(body.entry) ? body.entry.length : 0}`,
      })
      await saveWebhooks(kv, events)
      return json({ ok: true }, 200, origin)
    } catch {
      return json({ ok: false, error: 'Payload inválido' }, 400, origin)
    }
  }

  // OAuth callback (público, state anti-CSRF)
  if (
    (req.method === 'GET' || req.method === 'HEAD') &&
    path === '/oauth/instagram/callback'
  ) {
    if (req.method === 'HEAD') {
      return new Response(null, { status: 200 })
    }
    // Instagram às vezes devolve code com sufixo #_ na URL
    const codeRaw = url.searchParams.get('code') || ''
    const code = codeRaw.split('#')[0].replace(/_+$/, '').trim()
    const state = (url.searchParams.get('state') || '').trim()
    const err = url.searchParams.get('error')
    const errDesc = url.searchParams.get('error_description') || ''
    if (err || !code || !state) {
      const reason = errDesc || err || (!code ? 'missing_code' : 'callback')
      await saveOAuthLastError(kv, reason)
      await appendAudit(kv, {
        id: crypto.randomUUID(),
        actorId: 'oauth',
        actorName: 'OAuth',
        action: 'instagram.oauth_failed',
        objectType: 'social_account',
        objectId: 'instagram',
        meta: { reason },
        createdAt: nowIso(),
      })
      return redirectToAdmin(
        `${adminUrl}/?section=marketing&ig=error&reason=${encodeURIComponent(reason.slice(0, 160))}`,
      )
    }
    const st = await consumeOAuthState(kv, state)
    if (!st) {
      await saveOAuthLastError(kv, 'state')
      await appendAudit(kv, {
        id: crypto.randomUUID(),
        actorId: 'oauth',
        actorName: 'OAuth',
        action: 'instagram.oauth_failed',
        objectType: 'social_account',
        objectId: 'instagram',
        meta: { reason: 'state' },
        createdAt: nowIso(),
      })
      return redirectToAdmin(
        `${adminUrl}/?section=marketing&ig=error&reason=state`,
      )
    }
    try {
      if (!provider.isConfigured()) {
        await saveOAuthLastError(kv, 'config')
        return redirectToAdmin(
          `${adminUrl}/?section=marketing&ig=error&reason=config`,
        )
      }
      if (!igEnv.META_APP_SECRET) {
        await saveOAuthLastError(kv, 'missing_app_secret')
        return redirectToAdmin(
          `${adminUrl}/?section=marketing&ig=error&reason=${encodeURIComponent('App Secret ausente — salve de novo em App Meta / Instagram')}`,
        )
      }
      const short = await provider.exchangeCode(code)
      let accessToken = short.accessToken
      let expiresIn = 60 * 60 // short-lived fallback
      try {
        const long = await provider.exchangeLongLived(short.accessToken)
        accessToken = long.accessToken
        expiresIn = long.expiresIn
      } catch (e) {
        // Conecta com token curto (~1h) e registra motivo para o sync/UI
        const reason = isProviderError(e)
          ? e.message
          : 'troca para token de 60 dias falhou'
        try {
          await saveOAuthLastError(kv, `token_longo: ${reason}`)
        } catch {
          /* ignore */
        }
      }
      // /me às vezes falha com "Unsupported request - method type: get"
      // (app sem advanced access). Mesmo assim conectamos com o user_id do OAuth.
      let me: {
        userId: string
        username: string
        accountType: string
        profilePictureUrl?: string
      } = {
        userId: short.userId,
        username: '',
        accountType: 'PROFESSIONAL',
      }
      try {
        me = await provider.getMe(accessToken)
      } catch {
        /* perfil opcional no connect */
      }
      const existing = await getAccount(kv)
      const encrypted = await encryptSecret(accessToken, encryptionKey(env))
      const account: SocialAccount = {
        id: existing?.id || crypto.randomUUID(),
        provider: 'instagram',
        externalUserId: me.userId || short.userId,
        username: me.username || `user_${short.userId}`,
        accountType: me.accountType || 'PROFESSIONAL',
        profilePictureUrl: me.profilePictureUrl,
        scopes: [...provider.configStatus().scopes],
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        status: 'connected',
        lastSyncedAt: nowIso(),
        encryptedAccessToken: encrypted,
        createdAt: existing?.createdAt || nowIso(),
        updatedAt: nowIso(),
      }
      await saveAccount(kv, account)

      // retoma conteúdos pausados por desconexão
      const contents = await listContent(kv)
      let changed = false
      for (const c of contents) {
        if (c.status === 'PAUSED' && !c.deletedAt) {
          c.status = c.scheduledAt ? 'SCHEDULED' : 'DRAFT'
          c.updatedAt = nowIso()
          changed = true
        }
      }
      if (changed) await saveContent(kv, contents)

      try {
        await kv.delete?.('ig:oauth_last_error')
      } catch {
        /* ignore */
      }

      await appendAudit(kv, {
        id: crypto.randomUUID(),
        actorId: st.userId,
        actorName: 'OAuth',
        action: 'instagram.connected',
        objectType: 'social_account',
        objectId: account.id,
        createdAt: nowIso(),
      })
      return redirectToAdmin(`${adminUrl}/?section=marketing&ig=connected`)
    } catch (e) {
      const msg = isProviderError(e)
        ? e.message
        : e instanceof Error
          ? e.message
          : 'oauth_failed'
      await saveOAuthLastError(kv, msg)
      await appendAudit(kv, {
        id: crypto.randomUUID(),
        actorId: st.userId,
        actorName: 'OAuth',
        action: 'instagram.oauth_failed',
        objectType: 'social_account',
        objectId: 'instagram',
        meta: { reason: msg.slice(0, 160) },
        createdAt: nowIso(),
      })
      return redirectToAdmin(
        `${adminUrl}/?section=marketing&ig=error&reason=${encodeURIComponent(msg.slice(0, 160))}`,
      )
    }
  }

  if (!path.startsWith('/marketing') && !path.startsWith('/oauth/instagram')) {
    return null
  }

  // Rotas autenticadas
  async function beginOAuth(auth: AuthUser) {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão para conectar' }, 403, origin)
    }
    if (!provider.isConfigured()) {
      return json(
        {
          ok: false,
          error: 'Configure META_APP_ID, META_APP_SECRET e INSTAGRAM_REDIRECT_URI',
          config: provider.configStatus(),
        },
        503,
        origin,
      )
    }
    const state = crypto.randomUUID()
    await putOAuthState(kv, {
      state,
      userId: auth.id,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    await audit(kv, auth, 'instagram.oauth_start', 'social_account', 'instagram')
    return provider.buildAuthorizeUrl(state)
  }

  if (
    (path === '/oauth/instagram/start' || path === '/marketing/oauth/url') &&
    req.method === 'GET'
  ) {
    const auth = await opts.requireAuth()
    if (auth instanceof Response) return auth
    const urlOrRes = await beginOAuth(auth)
    if (urlOrRes instanceof Response) return urlOrRes
    if (path === '/marketing/oauth/url') {
      return json({ ok: true, url: urlOrRes }, 200, origin)
    }
    return redirect(urlOrRes)
  }

  if (!path.startsWith('/marketing')) return null

  const auth = await opts.requireAuth()
  if (auth instanceof Response) return auth
  if (!canViewMarketing(auth.role)) {
    return json({ ok: false, error: 'Sem permissão' }, 403, origin)
  }

  // Meta app config (admin cola App ID/Secret uma vez)
  if (path === '/marketing/meta-config' && req.method === 'POST') {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    try {
      const body = (await req.json()) as {
        appId?: string
        appSecret?: string
        redirectUri?: string
      }
      const appId = (body.appId || '').trim()
      const appSecret = (body.appSecret || '').trim()
      if (!appId || !appSecret) {
        return json(
          { ok: false, error: 'Informe App ID e App Secret' },
          400,
          origin,
        )
      }
      const redirectUri =
        (body.redirectUri || '').trim() ||
        igEnv.INSTAGRAM_REDIRECT_URI ||
        `${url.origin}/oauth/instagram/callback`
      await saveMetaConfig(kv, {
        appId,
        encryptedAppSecret: await encryptSecret(appSecret, encryptionKey(env)),
        redirectUri,
        updatedAt: nowIso(),
        updatedBy: auth.id,
      })
      await audit(kv, auth, 'meta.config_saved', 'meta_config', appId)
      const next = new InstagramProvider({
        META_APP_ID: appId,
        META_APP_SECRET: appSecret,
        INSTAGRAM_REDIRECT_URI: redirectUri,
        META_GRAPH_VERSION: env.META_GRAPH_VERSION,
      })
      return json({ ok: true, config: next.configStatus() }, 200, origin)
    } catch {
      return json({ ok: false, error: 'JSON inválido' }, 400, origin)
    }
  }

  // Account
  if (path === '/marketing/account' && req.method === 'GET') {
    const account = await getAccount(kv)
    let limits = null
    if (account?.status === 'connected' && account.encryptedAccessToken) {
      try {
        const token = await decryptSecret(
          account.encryptedAccessToken,
          encryptionKey(env),
        )
        limits = await provider.getPublishingLimit(
          account.externalUserId,
          token,
        )
      } catch {
        limits = null
      }
    }
    const stored = await getMetaConfig(kv)
    let lastOAuthError: { reason: string; at: string } | null = null
    try {
      const rawErr = await kv.get('ig:oauth_last_error')
      if (rawErr) lastOAuthError = JSON.parse(rawErr) as {
        reason: string
        at: string
      }
    } catch {
      lastOAuthError = null
    }
    return json(
      {
        ok: true,
        account: publicAccount(account),
        config: {
          ...provider.configStatus(),
          appIdMasked: stored?.appId
            ? `${stored.appId.slice(0, 4)}…${stored.appId.slice(-4)}`
            : igEnv.META_APP_ID
              ? `${igEnv.META_APP_ID.slice(0, 4)}…${igEnv.META_APP_ID.slice(-4)}`
              : null,
          hasAppSecret: Boolean(igEnv.META_APP_SECRET),
          setupHint:
            'Use o Instagram App ID e Instagram App Secret (não o App ID do Facebook/Pixel). Caminho: developers.facebook.com → seu app → Instagram → API setup with Instagram login → Business login settings.',
          oauthRedirectToRegister: igEnv.INSTAGRAM_REDIRECT_URI,
          lastOAuthError,
        },
        limits,
        timezone: DEFAULT_TIMEZONE,
      },
      200,
      origin,
    )
  }

  if (path === '/marketing/account/disconnect' && req.method === 'POST') {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    const account = await getAccount(kv)
    if (account) {
      account.status = 'disconnected'
      account.encryptedAccessToken = undefined
      account.updatedAt = nowIso()
      await saveAccount(kv, account)
      const contents = await listContent(kv)
      for (const c of contents) {
        if (
          ['SCHEDULED', 'QUEUED'].includes(c.status) &&
          !c.deletedAt
        ) {
          c.status = 'PAUSED'
          c.updatedAt = nowIso()
        }
      }
      await saveContent(kv, contents)
      await audit(kv, auth, 'instagram.disconnected', 'social_account', account.id)
    }
    return json({ ok: true }, 200, origin)
  }

  if (path === '/marketing/account/sync' && req.method === 'POST') {
    const account = await getAccount(kv)
    if (!account?.encryptedAccessToken) {
      return json({ ok: false, error: 'Nenhuma conta conectada' }, 400, origin)
    }
    try {
      let token = await decryptSecret(
        account.encryptedAccessToken,
        encryptionKey(env),
      )
      const warnings: string[] = []
      const msLeft = account.tokenExpiresAt
        ? new Date(account.tokenExpiresAt).getTime() - Date.now()
        : null
      const TWO_DAYS = 2 * 24 * 60 * 60 * 1000
      const TEN_DAYS = 10 * 24 * 60 * 60 * 1000

      if (msLeft != null && msLeft <= 0) {
        account.status = 'expired'
        account.updatedAt = nowIso()
        await saveAccount(kv, account)
        return json(
          {
            ok: false,
            error: 'Token Instagram expirado. Clique em Reconectar Instagram.',
            account: publicAccount(account),
          },
          400,
          origin,
        )
      }

      if (msLeft == null || (msLeft > 0 && msLeft < TWO_DAYS)) {
        // Token curto (~1h), sem expiry, ou quase expirando — promove para 60 dias
        try {
          const long = await provider.exchangeLongLived(token)
          token = long.accessToken
          account.encryptedAccessToken = await encryptSecret(
            token,
            encryptionKey(env),
          )
          account.tokenExpiresAt = new Date(
            Date.now() + long.expiresIn * 1000,
          ).toISOString()
        } catch (e) {
          const msg = isProviderError(e) ? e.message : 'falha na troca'
          const metaGate = /unsupported request|method type/i.test(msg)
          warnings.push(
            metaGate
              ? 'Meta bloqueou troca de token longo neste app (App Review / Advanced Access / verificação do negócio). Sem isso o token dura ~1h — reconecte após liberar, ou publique só dentro da hora.'
              : `Token longo: ${msg}. Reconecte o Instagram se a publicação falhar.`,
          )
          if (msLeft != null && msLeft < 5 * 60 * 1000) {
            account.status = 'expired'
            account.updatedAt = nowIso()
            await saveAccount(kv, account)
            return json(
              {
                ok: false,
                error:
                  'Token Instagram expirado. Clique em Reconectar Instagram.',
                warnings,
                account: publicAccount(account),
              },
              400,
              origin,
            )
          }
        }
      } else if (msLeft < TEN_DAYS) {
        try {
          const refreshed = await provider.refreshLongLived(token)
          token = refreshed.accessToken
          account.encryptedAccessToken = await encryptSecret(
            token,
            encryptionKey(env),
          )
          account.tokenExpiresAt = new Date(
            Date.now() + refreshed.expiresIn * 1000,
          ).toISOString()
        } catch (e) {
          warnings.push(
            `Renovação: ${isProviderError(e) ? e.message : 'falha ao renovar'}`,
          )
        }
      }

      try {
        const me = await provider.getMe(token, account.externalUserId)
        if (me.username) account.username = me.username
        if (me.profilePictureUrl) account.profilePictureUrl = me.profilePictureUrl
        if (me.accountType) account.accountType = me.accountType
        if (me.userId) account.externalUserId = me.userId
      } catch (e) {
        warnings.push(
          `Perfil: ${isProviderError(e) ? e.message : 'não foi possível ler @usuario'}`,
        )
      }
      account.lastSyncedAt = nowIso()
      account.status = 'connected'
      account.updatedAt = nowIso()
      await saveAccount(kv, account)
      await audit(kv, auth, 'instagram.synced', 'social_account', account.id)
      return json(
        { ok: true, account: publicAccount(account), warnings },
        200,
        origin,
      )
    } catch (e) {
      if (isProviderError(e) && e.code === '190') {
        account.status = 'expired'
        await saveAccount(kv, account)
      }
      return json(
        {
          ok: false,
          error: isProviderError(e) ? e.message : 'Falha na sincronização',
        },
        400,
        origin,
      )
    }
  }

  // Summary
  if (path === '/marketing/summary' && req.method === 'GET') {
    const items = await listContent(kv)
    const account = await getAccount(kv)
    return json(
      {
        ok: true,
        summary: summarizeContent(items),
        connectionStatus: account?.status || 'disconnected',
      },
      200,
      origin,
    )
  }

  // Notifications
  if (path === '/marketing/notifications' && req.method === 'GET') {
    const all = await listNotifications(kv)
    const mine = all.filter((n) => !n.userId || n.userId === auth.id)
    return json({ ok: true, notifications: mine.slice(0, 50) }, 200, origin)
  }

  if (path === '/marketing/notifications/read' && req.method === 'POST') {
    const notes = await listNotifications(kv)
    for (const n of notes) {
      if (!n.userId || n.userId === auth.id) n.read = true
    }
    await saveNotifications(kv, notes)
    return json({ ok: true }, 200, origin)
  }

  // Media library
  if (path === '/marketing/media' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase()
    let items = (await listMedia(kv)).filter((m) => !m.deletedAt)
    if (q) {
      items = items.filter(
        (m) =>
          m.storageKey.toLowerCase().includes(q) ||
          m.mime.includes(q) ||
          m.hash.includes(q),
      )
    }
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    return json({ ok: true, media: items }, 200, origin)
  }

  if (path === '/marketing/media/upload' && req.method === 'POST') {
    if (!canEditDrafts(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    try {
    const form = await req.formData()
    const file = form.get('file')
    // Em Workers o entry pode ser File ou Blob com name
    const blob =
      typeof file === 'object' &&
      file !== null &&
      typeof (file as Blob).arrayBuffer === 'function'
        ? (file as Blob)
        : null
    if (!blob || !blob.size) {
      return json(
        {
          ok: false,
          error: 'Arquivo obrigatório',
          debugType: file === null ? 'null' : typeof file,
        },
        400,
        origin,
      )
    }
    const buf = new Uint8Array(await blob.arrayBuffer())
    const detected = detectMedia(buf)
    if (!detected) {
      return json(
        { ok: false, error: 'Tipo de arquivo não suportado (use JPEG, PNG ou MP4)' },
        400,
        origin,
      )
    }
    if (buf.byteLength > maxSizeFor(detected.kind)) {
      return json({ ok: false, error: 'Arquivo excede o tamanho máximo' }, 400, origin)
    }
    const hash = await sha256Hex(buf)
    const existing = (await listMedia(kv)).find(
      (m) => m.hash === hash && !m.deletedAt,
    )
    if (existing) {
      return json({ ok: true, media: existing, deduped: true }, 200, origin)
    }

    // Pathname simples — a API Blob rejeita alguns formatos de pasta
    const key = `ig-${hash.slice(0, 16)}-${Date.now()}.${detected.ext}`
    const assetId = crypto.randomUUID()
    const apiBase = (
      env.PUBLIC_API_URL ||
      env.MEDIA_PUBLIC_BASE_URL ||
      url.origin
    ).replace(/\/$/, '')
    let publicUrl = ''
    let storageKey = key

    if (env.MEDIA_R2 && env.MEDIA_PUBLIC_BASE_URL) {
      const up = await uploadToR2(
        env.MEDIA_R2,
        key,
        buf,
        detected.mime,
        env.MEDIA_PUBLIC_BASE_URL,
      )
      publicUrl = up.url
      storageKey = up.pathname
    } else {
      // Cloudflare KV + proxy público (sem Vercel)
      const kvLimit = 20 * 1024 * 1024
      if (buf.byteLength > kvLimit) {
        return json(
          {
            ok: false,
            error:
              'Arquivo grande demais para o KV. Ative R2 na Cloudflare ou envie arquivo menor (máx. ~20MB).',
          },
          503,
          origin,
        )
      }
      storageKey = `kv:ig:media:${assetId}`
      await kv.put(storageKey, buf, {
        expirationTtl: 60 * 60 * 24 * 120,
      })
      publicUrl = `${apiBase}/marketing/media/file/${assetId}`
    }

    const asset: MediaAsset = {
      id: assetId,
      uploaderId: auth.id,
      uploaderName: auth.name,
      storageKey,
      publicUrl,
      mime: detected.mime,
      kind: detected.kind,
      hash,
      size: buf.byteLength,
      thumbnailUrl: detected.kind === 'image' ? publicUrl : undefined,
      validationStatus: 'valid',
      validationErrors: [],
      usedByContentIds: [],
      createdAt: nowIso(),
    }
    const media = await listMedia(kv)
    media.unshift(asset)
    await saveMedia(kv, media)
    await audit(kv, auth, 'media.uploaded', 'media', asset.id, {
      size: asset.size,
      mime: asset.mime,
    })
    return json({ ok: true, media: asset }, 201, origin)
    } catch (e) {
      return json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha no upload',
        },
        400,
        origin,
      )
    }
  }

  const mediaDelete = path.match(/^\/marketing\/media\/([^/]+)$/)
  if (mediaDelete && req.method === 'DELETE') {
    if (!canEditDrafts(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    const id = decodeURIComponent(mediaDelete[1])
    const media = await listMedia(kv)
    const idx = media.findIndex((m) => m.id === id)
    if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
    if (media[idx].usedByContentIds.length) {
      return json(
        {
          ok: false,
          error: 'Arquivo em uso em publicações',
          usedBy: media[idx].usedByContentIds,
        },
        409,
        origin,
      )
    }
    media[idx] = { ...media[idx], deletedAt: nowIso() }
    await saveMedia(kv, media)
    await audit(kv, auth, 'media.deleted', 'media', id)
    return json({ ok: true }, 200, origin)
  }

  // Content list
  if (path === '/marketing/content' && req.method === 'GET') {
    const status = url.searchParams.get('status')
    const format = url.searchParams.get('format')
    const q = (url.searchParams.get('q') || '').toLowerCase()
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('pageSize') || '20')),
    )
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let items = (await listContent(kv)).filter((c) => !c.deletedAt)
    if (status && status !== 'ALL') {
      if (status === 'PROCESSING') {
        items = items.filter((c) =>
          ['QUEUED', 'PREPARING', 'PROCESSING_MEDIA', 'PUBLISHING'].includes(
            c.status,
          ),
        )
      } else if (status === 'FAILED') {
        items = items.filter((c) =>
          ['FAILED_RETRYABLE', 'FAILED_PERMANENT'].includes(c.status),
        )
      } else {
        items = items.filter((c) => c.status === status)
      }
    }
    if (format) items = items.filter((c) => c.format === format)
    if (q) {
      items = items.filter(
        (c) =>
          c.caption.toLowerCase().includes(q) ||
          c.hashtags.toLowerCase().includes(q) ||
          c.assigneeName.toLowerCase().includes(q),
      )
    }
    if (from) {
      const t = new Date(from).getTime()
      items = items.filter(
        (c) => new Date(c.scheduledAt || c.createdAt).getTime() >= t,
      )
    }
    if (to) {
      const t = new Date(to).getTime()
      items = items.filter(
        (c) => new Date(c.scheduledAt || c.createdAt).getTime() <= t,
      )
    }
    items.sort((a, b) => {
      const ta = new Date(a.scheduledAt || a.createdAt).getTime()
      const tb = new Date(b.scheduledAt || b.createdAt).getTime()
      return tb - ta
    })
    const total = items.length
    const slice = items.slice((page - 1) * pageSize, page * pageSize)
    const media = await listMedia(kv)
    const mediaMap = Object.fromEntries(media.map((m) => [m.id, m]))
    return json(
      {
        ok: true,
        total,
        page,
        pageSize,
        items: slice.map((c) => ({
          ...c,
          mediaDetails: c.media
            .map((ref) => mediaMap[ref.mediaId])
            .filter(Boolean),
        })),
      },
      200,
      origin,
    )
  }

  if (path === '/marketing/content' && req.method === 'POST') {
    if (!canEditDrafts(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    try {
      const body = (await req.json()) as {
        format: ContentFormat
        caption?: string
        hashtags?: string
        altText?: string
        coverUrl?: string
        internalNote?: string
        mediaIds: string[]
        scheduledAt?: string | null
        publishNow?: boolean
        saveDraft?: boolean
        assigneeId?: string
        assigneeName?: string
        timezone?: string
      }
      const account = await getAccount(kv)
      if (!account || account.status === 'disconnected') {
        return json(
          { ok: false, error: 'Conecte uma conta Instagram profissional' },
          400,
          origin,
        )
      }
      const mediaAll = await listMedia(kv)
      const selected = (body.mediaIds || [])
        .map((id) => mediaAll.find((m) => m.id === id && !m.deletedAt))
        .filter(Boolean) as MediaAsset[]
      const format = body.format
      const isStory = format.startsWith('STORY')
      const capErr = isStory
        ? []
        : validateCaption(body.caption || '', body.hashtags || '')
      const mediaErr = validateFormatMedia(
        format,
        selected.map((m) => ({
          kind: m.kind,
          mime: m.mime,
          size: m.size,
          durationSec: m.durationSec,
        })),
      )
      const errors = [...capErr, ...mediaErr]
      if (errors.length) {
        return json({ ok: false, error: errors.join('; '), errors }, 400, origin)
      }

      let status: ContentStatus = 'DRAFT'
      let scheduledAt: string | null = body.scheduledAt || null
      if (body.publishNow) {
        if (!canPublish(auth.role)) {
          return json({ ok: false, error: 'Sem permissão para publicar' }, 403, origin)
        }
        status = 'QUEUED'
      } else if (scheduledAt) {
        if (!canPublish(auth.role)) {
          return json({ ok: false, error: 'Sem permissão para agendar' }, 403, origin)
        }
        status = 'SCHEDULED'
      } else if (body.saveDraft !== false) {
        status = 'DRAFT'
      }

      const item: ContentItem = {
        id: crypto.randomUUID(),
        accountId: account.id,
        format,
        caption: isStory ? '' : body.caption || '',
        hashtags: isStory ? '' : body.hashtags || '',
        altText: body.altText,
        coverUrl: body.coverUrl,
        internalNote: isStory
          ? body.internalNote || body.caption || undefined
          : body.internalNote,
        timezone: body.timezone || DEFAULT_TIMEZONE,
        scheduledAt,
        publishedAt: null,
        status,
        authorId: auth.id,
        authorName: auth.name,
        assigneeId: body.assigneeId || auth.id,
        assigneeName: body.assigneeName || auth.name,
        idempotencyKey: crypto.randomUUID(),
        attempts: 0,
        media: selected.map((m, i) => ({ mediaId: m.id, position: i })),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }

      const contents = await listContent(kv)
      contents.unshift(item)
      await saveContent(kv, contents)

      for (const m of selected) {
        if (!m.usedByContentIds.includes(item.id)) {
          m.usedByContentIds.push(item.id)
        }
      }
      await saveMedia(kv, mediaAll)

      if (status === 'QUEUED' || status === 'SCHEDULED') {
        const jobs = await listJobs(kv)
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
        await saveJobs(kv, jobs)
      }

      await audit(kv, auth, 'content.created', 'content', item.id, {
        status: item.status,
        format: item.format,
      })

      if (body.publishNow) {
        const result = await publishContentItem(
          kv,
          item.id,
          {
            TOKEN_ENCRYPTION_KEY: encryptionKey(env),
            META_APP_ID: env.META_APP_ID,
            META_APP_SECRET: env.META_APP_SECRET,
            INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
            META_GRAPH_VERSION: env.META_GRAPH_VERSION,
          },
          `api-${auth.id.slice(0, 6)}`,
        )
        const fresh = (await listContent(kv)).find((c) => c.id === item.id)
        return json({ ok: result.ok, content: fresh, publish: result }, 201, origin)
      }

      return json({ ok: true, content: item }, 201, origin)
    } catch (e) {
      return json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'JSON inválido',
        },
        400,
        origin,
      )
    }
  }

  // Batch create
  if (path === '/marketing/content/batch' && req.method === 'POST') {
    if (!canPublish(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    try {
      const body = (await req.json()) as {
        items: BatchItemInput[]
        rule: ScheduleRuleInput
        defaultCaption?: string
        defaultHashtags?: string
      }
      const account = await getAccount(kv)
      if (!account || account.status !== 'connected') {
        return json({ ok: false, error: 'Conta Instagram não conectada' }, 400, origin)
      }
      const mediaAll = await listMedia(kv)
      const contents = await listContent(kv)
      const occupied = contents
        .filter(
          (c) =>
            !c.deletedAt &&
            c.scheduledAt &&
            ['SCHEDULED', 'QUEUED', 'PUBLISHED'].includes(c.status),
        )
        .map((c) => c.scheduledAt!) 

      const items = body.items || []
      if (!items.length) {
        return json({ ok: false, error: 'Nenhum item' }, 400, origin)
      }
      if (items.length > DAILY_PUBLISH_LIMIT) {
        return json(
          {
            ok: false,
            error: `Máximo ${DAILY_PUBLISH_LIMIT} itens por lote (limite da API)`,
          },
          400,
          origin,
        )
      }

      const itemErrors: { index: number; error: string }[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const m = mediaAll.find((x) => x.id === it.mediaId && !x.deletedAt)
        if (!m) {
          itemErrors.push({ index: i, error: 'Mídia não encontrada' })
          continue
        }
        const isStory = it.format.startsWith('STORY')
        const errs = [
          ...(isStory
            ? []
            : validateCaption(
                it.caption ?? body.defaultCaption ?? '',
                it.hashtags ?? body.defaultHashtags ?? '',
              )),
          ...validateFormatMedia(it.format, [
            {
              kind: m.kind,
              mime: m.mime,
              size: m.size,
              durationSec: m.durationSec,
            },
          ]),
        ]
        if (errs.length) itemErrors.push({ index: i, error: errs.join('; ') })
      }
      if (itemErrors.length) {
        return json(
          { ok: false, error: 'Itens inválidos', itemErrors },
          400,
          origin,
        )
      }

      const rule: ScheduleRuleInput = {
        ...body.rule,
        timezone: body.rule.timezone || DEFAULT_TIMEZONE,
        manualTimes: items.map((it) => it.scheduledAt || null),
      }
      const schedule =
        rule.mode === 'manual'
          ? distributeSchedule(items.length, rule, occupied)
          : distributeSchedule(items.length, { ...rule, mode: rule.mode }, occupied)

      const created: ContentItem[] = []
      const jobs = await listJobs(kv)

      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const m = mediaAll.find((x) => x.id === it.mediaId)!
        const isStory = it.format.startsWith('STORY')
        const rawCaption = it.caption ?? body.defaultCaption ?? ''
        const item: ContentItem = {
          id: crypto.randomUUID(),
          accountId: account.id,
          format: it.format,
          caption: isStory ? '' : rawCaption,
          hashtags: isStory ? '' : it.hashtags ?? body.defaultHashtags ?? '',
          internalNote: isStory
            ? it.internalNote || rawCaption || undefined
            : it.internalNote,
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

      await saveContent(kv, contents)
      await saveMedia(kv, mediaAll)
      await saveJobs(kv, jobs)
      await audit(kv, auth, 'content.batch_created', 'content', 'batch', {
        count: created.length,
      })
      return json(
        { ok: true, contents: created, schedule },
        201,
        origin,
      )
    } catch (e) {
      return json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'Falha no lote',
        },
        400,
        origin,
      )
    }
  }

  // Preview distribution
  if (path === '/marketing/schedule/preview' && req.method === 'POST') {
    try {
      const body = (await req.json()) as {
        count: number
        rule: ScheduleRuleInput
      }
      const contents = await listContent(kv)
      const occupied = contents
        .filter((c) => !c.deletedAt && c.scheduledAt)
        .map((c) => c.scheduledAt!)
      const schedule = distributeSchedule(
        body.count,
        { ...body.rule, timezone: body.rule.timezone || DEFAULT_TIMEZONE },
        occupied,
      )
      return json({ ok: true, schedule }, 200, origin)
    } catch (e) {
      return json(
        {
          ok: false,
          error: e instanceof Error ? e.message : 'Prévia inválida',
        },
        400,
        origin,
      )
    }
  }

  const contentMatch = path.match(/^\/marketing\/content\/([^/]+)(?:\/([^/]+))?$/)
  if (contentMatch) {
    const id = decodeURIComponent(contentMatch[1])
    const action = contentMatch[2]

    if (!action && req.method === 'GET') {
      const item = (await listContent(kv)).find((c) => c.id === id)
      if (!item || item.deletedAt) {
        return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      }
      const media = await listMedia(kv)
      const attempts = (await listAttempts(kv)).filter((a) => a.contentId === id)
      const insights = (await listInsights(kv)).find((i) => i.contentId === id)
      return json(
        {
          ok: true,
          content: item,
          media: item.media
            .map((r) => media.find((m) => m.id === r.mediaId))
            .filter(Boolean),
          attempts,
          insights: insights || null,
        },
        200,
        origin,
      )
    }

    if (!action && req.method === 'PATCH') {
      if (!canEditDrafts(auth.role)) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const contents = await listContent(kv)
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      const item = contents[idx]
      if (['PUBLISHING', 'PROCESSING_MEDIA', 'PUBLISHED'].includes(item.status)) {
        return json(
          { ok: false, error: 'Não é possível editar neste status' },
          409,
          origin,
        )
      }
      const body = (await req.json()) as Partial<ContentItem> & {
        mediaIds?: string[]
      }
      if (typeof body.caption === 'string') item.caption = body.caption
      if (typeof body.hashtags === 'string') item.hashtags = body.hashtags
      if (typeof body.altText === 'string') item.altText = body.altText
      if (typeof body.coverUrl === 'string') item.coverUrl = body.coverUrl
      if (typeof body.internalNote === 'string') item.internalNote = body.internalNote
      if (body.format) item.format = body.format
      if (body.mediaIds) {
        item.media = body.mediaIds.map((mediaId, position) => ({
          mediaId,
          position,
        }))
      }
      if (body.scheduledAt !== undefined) {
        const prev = item.scheduledAt
        item.scheduledAt = body.scheduledAt
        if (
          item.scheduledAt &&
          item.status === 'DRAFT' &&
          canTransition(item.status, 'SCHEDULED')
        ) {
          item.status = 'SCHEDULED'
        }
        const jobs = await listJobs(kv)
        for (const j of jobs) {
          if (j.contentId === id && j.status === 'pending') {
            j.nextRunAt = item.scheduledAt || nowIso()
            j.updatedAt = nowIso()
          }
        }
        await saveJobs(kv, jobs)
        await audit(kv, auth, 'content.rescheduled', 'content', id, {
          from: prev,
          to: item.scheduledAt,
        })
      }
      item.updatedAt = nowIso()
      contents[idx] = item
      await saveContent(kv, contents)
      await audit(kv, auth, 'content.updated', 'content', id)
      return json({ ok: true, content: item }, 200, origin)
    }

    if (action === 'duplicate' && req.method === 'POST') {
      const contents = await listContent(kv)
      const src = contents.find((c) => c.id === id && !c.deletedAt)
      if (!src) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      const copy: ContentItem = {
        ...structuredClone(src),
        id: crypto.randomUUID(),
        status: 'DRAFT',
        scheduledAt: null,
        publishedAt: null,
        externalId: undefined,
        permalink: undefined,
        containerId: undefined,
        idempotencyKey: crypto.randomUUID(),
        attempts: 0,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        authorId: auth.id,
        authorName: auth.name,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      contents.unshift(copy)
      await saveContent(kv, contents)
      await audit(kv, auth, 'content.duplicated', 'content', copy.id, {
        from: id,
      })
      return json({ ok: true, content: copy }, 201, origin)
    }

    if (action === 'cancel' && req.method === 'POST') {
      if (!canPublish(auth.role)) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const contents = await listContent(kv)
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      const item = contents[idx]
      if (!canTransition(item.status, 'CANCELLED')) {
        return json({ ok: false, error: 'Não cancelável neste status' }, 409, origin)
      }
      assertTransition(item.status, 'CANCELLED')
      item.status = 'CANCELLED'
      item.updatedAt = nowIso()
      contents[idx] = item
      await saveContent(kv, contents)
      const jobs = await listJobs(kv)
      for (const j of jobs) {
        if (j.contentId === id && j.status !== 'done') {
          j.status = 'cancelled'
          j.updatedAt = nowIso()
        }
      }
      await saveJobs(kv, jobs)
      await audit(kv, auth, 'content.cancelled', 'content', id)
      return json({ ok: true, content: item }, 200, origin)
    }

    if (action === 'retry' && req.method === 'POST') {
      if (!canPublish(auth.role)) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const contents = await listContent(kv)
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      const item = contents[idx]
      if (item.status !== 'FAILED_RETRYABLE') {
        return json(
          { ok: false, error: 'Retry só é permitido em falhas recuperáveis' },
          409,
          origin,
        )
      }
      item.status = 'QUEUED'
      item.updatedAt = nowIso()
      contents[idx] = item
      await saveContent(kv, contents)
      const result = await publishContentItem(
        kv,
        id,
        {
          TOKEN_ENCRYPTION_KEY: encryptionKey(env),
          META_APP_ID: env.META_APP_ID,
          META_APP_SECRET: env.META_APP_SECRET,
          INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
          META_GRAPH_VERSION: env.META_GRAPH_VERSION,
        },
        `retry-${auth.id.slice(0, 6)}`,
      )
      const fresh = (await listContent(kv)).find((c) => c.id === id)
      await audit(kv, auth, 'content.retry', 'content', id)
      return json({ ok: result.ok, content: fresh, publish: result }, 200, origin)
    }

    if (action === 'publish' && req.method === 'POST') {
      if (!canPublish(auth.role)) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const contents = await listContent(kv)
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      const item = contents[idx]
      if (!['DRAFT', 'SCHEDULED', 'FAILED_RETRYABLE', 'PAUSED'].includes(item.status)) {
        return json({ ok: false, error: 'Status não permite publicar agora' }, 409, origin)
      }
      item.status = 'QUEUED'
      item.scheduledAt = nowIso()
      item.updatedAt = nowIso()
      contents[idx] = item
      await saveContent(kv, contents)
      const result = await publishContentItem(
        kv,
        id,
        {
          TOKEN_ENCRYPTION_KEY: encryptionKey(env),
          META_APP_ID: env.META_APP_ID,
          META_APP_SECRET: env.META_APP_SECRET,
          INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
          META_GRAPH_VERSION: env.META_GRAPH_VERSION,
        },
        `pub-${auth.id.slice(0, 6)}`,
      )
      const fresh = (await listContent(kv)).find((c) => c.id === id)
      await audit(kv, auth, 'content.publish_now', 'content', id)
      return json({ ok: result.ok, content: fresh, publish: result }, 200, origin)
    }

    if (!action && req.method === 'DELETE') {
      if (!canEditDrafts(auth.role)) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const contents = await listContent(kv)
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) return json({ ok: false, error: 'Não encontrado' }, 404, origin)
      if (contents[idx].status !== 'DRAFT' && contents[idx].status !== 'CANCELLED') {
        return json(
          { ok: false, error: 'Só rascunhos/cancelados podem ser excluídos' },
          409,
          origin,
        )
      }
      contents[idx].deletedAt = nowIso()
      await saveContent(kv, contents)
      await audit(kv, auth, 'content.deleted', 'content', id)
      return json({ ok: true }, 200, origin)
    }
  }

  // Bulk actions
  if (path === '/marketing/content/bulk' && req.method === 'POST') {
    if (!canPublish(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    const body = (await req.json()) as {
      action: 'cancel' | 'delete_drafts' | 'reschedule'
      ids: string[]
      scheduledAt?: string
    }
    const contents = await listContent(kv)
    let count = 0
    for (const id of body.ids || []) {
      const idx = contents.findIndex((c) => c.id === id && !c.deletedAt)
      if (idx < 0) continue
      const item = contents[idx]
      if (body.action === 'cancel' && canTransition(item.status, 'CANCELLED')) {
        item.status = 'CANCELLED'
        item.updatedAt = nowIso()
        count++
      } else if (body.action === 'delete_drafts' && item.status === 'DRAFT') {
        item.deletedAt = nowIso()
        count++
      } else if (body.action === 'reschedule' && body.scheduledAt) {
        item.scheduledAt = body.scheduledAt
        if (item.status === 'DRAFT') item.status = 'SCHEDULED'
        item.updatedAt = nowIso()
        count++
      }
    }
    await saveContent(kv, contents)
    await audit(kv, auth, `content.bulk_${body.action}`, 'content', 'bulk', {
      count,
    })
    return json({ ok: true, count }, 200, origin)
  }

  // Calendar
  if (path === '/marketing/calendar' && req.method === 'GET') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    let items = (await listContent(kv)).filter(
      (c) => !c.deletedAt && c.scheduledAt,
    )
    if (from) {
      const t = new Date(from).getTime()
      items = items.filter((c) => new Date(c.scheduledAt!).getTime() >= t)
    }
    if (to) {
      const t = new Date(to).getTime()
      items = items.filter((c) => new Date(c.scheduledAt!).getTime() <= t)
    }
    const media = await listMedia(kv)
    return json(
      {
        ok: true,
        timezone: DEFAULT_TIMEZONE,
        items: items.map((c) => ({
          ...c,
          thumb:
            media.find((m) => m.id === c.media[0]?.mediaId)?.thumbnailUrl ||
            media.find((m) => m.id === c.media[0]?.mediaId)?.publicUrl,
        })),
      },
      200,
      origin,
    )
  }

  // Audit
  if (path === '/marketing/audit' && req.method === 'GET') {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    return json({ ok: true, logs: (await listAudit(kv)).slice(0, 200) }, 200, origin)
  }

  // Jobs diagnostic
  if (path === '/marketing/jobs' && req.method === 'GET') {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    return json({ ok: true, jobs: await listJobs(kv) }, 200, origin)
  }

  if (path === '/marketing/jobs/process' && req.method === 'POST') {
    if (!canManageConnection(auth.role)) {
      return json({ ok: false, error: 'Sem permissão' }, 403, origin)
    }
    const result = await processDueJobs(kv, {
      TOKEN_ENCRYPTION_KEY: encryptionKey(env),
      META_APP_ID: env.META_APP_ID,
      META_APP_SECRET: env.META_APP_SECRET,
      INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
      META_GRAPH_VERSION: env.META_GRAPH_VERSION,
    })
    return json({ ok: true, ...result }, 200, origin)
  }

  // Insights sync
  if (path === '/marketing/insights/sync' && req.method === 'POST') {
    const account = await getAccount(kv)
    if (!account?.encryptedAccessToken) {
      return json({ ok: false, error: 'Conta não conectada' }, 400, origin)
    }
    const token = await decryptSecret(
      account.encryptedAccessToken,
      encryptionKey(env),
    )
    const contents = (await listContent(kv)).filter(
      (c) => c.status === 'PUBLISHED' && c.externalId,
    )
    let synced = 0
    for (const c of contents.slice(0, 20)) {
      try {
        const metrics =
          c.format === 'REEL'
            ? ['reach', 'likes', 'comments', 'shares']
            : ['reach', 'likes', 'comments', 'saved']
        const data = await provider.getMediaInsights(
          c.externalId!,
          token,
          metrics,
        )
        await upsertInsight(kv, {
          contentId: c.id,
          externalId: c.externalId!,
          metrics: data,
          fetchedAt: nowIso(),
        })
        synced++
      } catch {
        /* ignora item */
      }
    }
    account.lastSyncedAt = nowIso()
    await saveAccount(kv, account)
    return json({ ok: true, synced }, 200, origin)
  }

  return json({ ok: false, error: 'Rota marketing não encontrada' }, 404, origin)
}

export async function runMarketingCron(env: MarketingEnv) {
  return processDueJobs(env.LEADS_KV, {
    TOKEN_ENCRYPTION_KEY: encryptionKey(env),
    META_APP_ID: env.META_APP_ID,
    META_APP_SECRET: env.META_APP_SECRET,
    INSTAGRAM_REDIRECT_URI: env.INSTAGRAM_REDIRECT_URI,
    META_GRAPH_VERSION: env.META_GRAPH_VERSION,
  })
}
