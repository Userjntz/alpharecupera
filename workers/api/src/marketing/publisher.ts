import {
  assertTransition,
  combineCaption,
  nextBackoffMs,
  type ContentItem,
  type ContentStatus,
  type MediaAsset,
  type PublicationAttempt,
  type PublicationJob,
  type SocialAccount,
} from '../../../../shared/marketing'
import { decryptSecret, encryptSecret } from './crypto'
import { InstagramProvider, isProviderError } from './instagram'
import type { MarketingKv } from './store'
import {
  appendAudit,
  getAccount,
  listAttempts,
  listContent,
  listJobs,
  listMedia,
  listNotifications,
  saveAccount,
  saveAttempts,
  saveContent,
  saveJobs,
  saveNotifications,
  upsertInsight,
} from './store'

function nowIso() {
  return new Date().toISOString()
}

function setStatus(item: ContentItem, status: ContentStatus) {
  assertTransition(item.status, status)
  item.status = status
  item.updatedAt = nowIso()
}

async function getToken(
  account: SocialAccount,
  encryptionKey: string,
  provider: InstagramProvider,
): Promise<string> {
  if (!account.encryptedAccessToken) {
    throw { code: '190', message: 'Conta sem token', retryable: false }
  }
  let token = await decryptSecret(account.encryptedAccessToken, encryptionKey)
  const exp = account.tokenExpiresAt
    ? new Date(account.tokenExpiresAt).getTime()
    : 0
  const tenDays = 10 * 24 * 60 * 60 * 1000
  if (exp && exp - Date.now() < tenDays) {
    try {
      const refreshed = await provider.refreshLongLived(token)
      token = refreshed.accessToken
      account.encryptedAccessToken = await encryptSecret(token, encryptionKey)
      account.tokenExpiresAt = new Date(
        Date.now() + refreshed.expiresIn * 1000,
      ).toISOString()
      account.updatedAt = nowIso()
      account.status = 'connected'
    } catch {
      /* tenta com o token atual */
    }
  }
  return token
}

async function waitForContainer(
  provider: InstagramProvider,
  containerId: string,
  token: string,
  maxMs = 120_000,
) {
  const started = Date.now()
  let delay = 2000
  while (Date.now() - started < maxMs) {
    const status = await provider.getContainerStatus(containerId, token)
    if (status === 'FINISHED' || status === 'PUBLISHED') return
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw {
        code: 'MEDIA_ERROR',
        message: `Processamento de mídia falhou (${status})`,
        retryable: false,
      }
    }
    await new Promise((r) => setTimeout(r, delay))
    delay = Math.min(10_000, delay + 1000)
  }
  throw {
    code: 'TIMEOUT',
    message: 'Timeout aguardando processamento da mídia',
    retryable: true,
  }
}

export async function publishContentItem(
  kv: MarketingKv,
  contentId: string,
  env: {
    TOKEN_ENCRYPTION_KEY: string
    META_APP_ID?: string
    META_APP_SECRET?: string
    INSTAGRAM_REDIRECT_URI?: string
    META_GRAPH_VERSION?: string
  },
  workerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const contents = await listContent(kv)
  const idx = contents.findIndex((c) => c.id === contentId && !c.deletedAt)
  if (idx < 0) return { ok: false, error: 'Conteúdo não encontrado' }
  const item = contents[idx]
  const account = await getAccount(kv)
  if (!account || account.status === 'disconnected') {
    setStatus(item, 'PAUSED')
    item.lastErrorMessage = 'Conta Instagram desconectada'
    contents[idx] = item
    await saveContent(kv, contents)
    return { ok: false, error: item.lastErrorMessage }
  }

  const jobs = await listJobs(kv)
  let job = jobs.find(
    (j) =>
      j.contentId === contentId &&
      (j.status === 'pending' || j.status === 'running'),
  )
  if (!job) {
    job = {
      id: crypto.randomUUID(),
      contentId,
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
  job.lockedAt = nowIso()
  job.lockOwner = workerId
  job.version += 1
  job.attempts += 1
  job.updatedAt = nowIso()
  await saveJobs(kv, jobs)

  const attempts = await listAttempts(kv)
  const attempt: PublicationAttempt = {
    id: crypto.randomUUID(),
    contentId,
    jobId: job.id,
    startedAt: nowIso(),
    finishedAt: null,
    ok: false,
  }
  attempts.unshift(attempt)
  await saveAttempts(kv, attempts)

  const provider = new InstagramProvider(env)
  const mediaAssets = await listMedia(kv)
  const mediaById = new Map(mediaAssets.map((m) => [m.id, m]))

  try {
    if (['PUBLISHED'].includes(item.status)) {
      job.status = 'done'
      job.lockOwner = null
      await saveJobs(kv, jobs)
      attempt.ok = true
      attempt.finishedAt = nowIso()
      await saveAttempts(kv, attempts)
      return { ok: true }
    }

    if (item.status === 'SCHEDULED' || item.status === 'FAILED_RETRYABLE') {
      setStatus(item, 'QUEUED')
    }
    setStatus(item, 'PREPARING')
    item.attempts = (item.attempts || 0) + 1
    contents[idx] = item
    await saveContent(kv, contents)

    const token = await getToken(account, env.TOKEN_ENCRYPTION_KEY, provider)
    await saveAccount(kv, account)

    const ordered = [...item.media]
      .sort((a, b) => a.position - b.position)
      .map((ref) => mediaById.get(ref.mediaId))
      .filter(Boolean) as MediaAsset[]

    if (!ordered.length) {
      throw {
        code: 'MEDIA_MISSING',
        message: 'Mídia não encontrada',
        retryable: false,
      }
    }

    const caption = combineCaption(item.caption, item.hashtags)
    let containerId: string

    if (item.format === 'CAROUSEL') {
      const children: string[] = []
      for (const m of ordered) {
        const childId = await provider.createMediaContainer(
          account.externalUserId,
          token,
          {
            format: m.kind === 'video' ? 'FEED_VIDEO' : 'FEED_IMAGE',
            mediaUrl: m.publicUrl,
            isCarouselItem: true,
          },
        )
        if (m.kind === 'video') {
          item.status = 'PROCESSING_MEDIA'
          contents[idx] = item
          await saveContent(kv, contents)
          await waitForContainer(provider, childId, token)
        }
        children.push(childId)
      }
      containerId = await provider.createMediaContainer(
        account.externalUserId,
        token,
        {
          format: 'CAROUSEL',
          mediaUrl: ordered[0].publicUrl,
          caption,
          children,
        },
      )
    } else {
      const m = ordered[0]
      containerId = await provider.createMediaContainer(
        account.externalUserId,
        token,
        {
          format: item.format,
          mediaUrl: m.publicUrl,
          caption: item.format.startsWith('STORY') ? undefined : caption,
          coverUrl: item.coverUrl,
          altText: item.altText,
        },
      )
      if (
        item.format === 'REEL' ||
        item.format === 'FEED_VIDEO' ||
        item.format === 'STORY_VIDEO'
      ) {
        item.status = 'PROCESSING_MEDIA'
        item.containerId = containerId
        contents[idx] = item
        await saveContent(kv, contents)
        await waitForContainer(provider, containerId, token)
      }
    }

    item.containerId = containerId
    item.status = 'PUBLISHING'
    contents[idx] = item
    await saveContent(kv, contents)

    const published = await provider.publish(
      account.externalUserId,
      token,
      containerId,
    )
    let permalink: string | null = null
    try {
      permalink = await provider.getPermalink(published.id, token)
    } catch {
      /* opcional */
    }

    item.externalId = published.id
    item.permalink = permalink || undefined
    item.publishedAt = nowIso()
    item.status = 'PUBLISHED'
    item.lastErrorCode = undefined
    item.lastErrorMessage = undefined
    item.updatedAt = nowIso()
    contents[idx] = item
    await saveContent(kv, contents)

    job.status = 'done'
    job.lockOwner = null
    job.lockedAt = null
    job.updatedAt = nowIso()
    await saveJobs(kv, jobs)

    attempt.ok = true
    attempt.finishedAt = nowIso()
    await saveAttempts(kv, attempts)

    await appendAudit(kv, {
      id: crypto.randomUUID(),
      actorId: 'system',
      actorName: 'Worker',
      action: 'content.published',
      objectType: 'content',
      objectId: item.id,
      meta: { externalId: published.id },
      createdAt: nowIso(),
    })

    const notes = await listNotifications(kv)
    notes.unshift({
      id: crypto.randomUUID(),
      userId: item.assigneeId,
      type: 'published',
      title: 'Publicação concluída',
      body: `@${account.username}: ${item.format} publicado`,
      read: false,
      createdAt: nowIso(),
    })
    await saveNotifications(kv, notes)

    try {
      const metrics =
        item.format === 'REEL'
          ? ['reach', 'likes', 'comments', 'shares', 'total_interactions']
          : item.format.startsWith('STORY')
            ? ['reach', 'replies', 'navigation']
            : ['reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions']
      const data = await provider.getMediaInsights(published.id, token, metrics)
      await upsertInsight(kv, {
        contentId: item.id,
        externalId: published.id,
        metrics: data,
        fetchedAt: nowIso(),
      })
    } catch {
      /* insights podem falhar sem App Review */
    }

    return { ok: true }
  } catch (err) {
    const pe = isProviderError(err)
      ? err
      : {
          code: 'UNKNOWN',
          message: err instanceof Error ? err.message : 'Erro desconhecido',
          retryable: true,
        }

    item.lastErrorCode = pe.code
    item.lastErrorMessage = pe.message
    item.updatedAt = nowIso()

    if (pe.code === '190') {
      account.status = 'expired'
      await saveAccount(kv, account)
    }

    const retryable = pe.retryable && job.attempts < job.maxAttempts
    item.status = retryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT'
    contents[idx] = item
    await saveContent(kv, contents)

    job.status = retryable ? 'pending' : 'failed'
    job.nextRunAt = new Date(
      Date.now() + nextBackoffMs(job.attempts),
    ).toISOString()
    job.lockOwner = null
    job.lockedAt = null
    job.updatedAt = nowIso()
    await saveJobs(kv, jobs)

    attempt.ok = false
    attempt.finishedAt = nowIso()
    attempt.errorCode = pe.code
    attempt.errorMessage = pe.message
    attempt.retryable = pe.retryable
    await saveAttempts(kv, attempts)

    const notes = await listNotifications(kv)
    notes.unshift({
      id: crypto.randomUUID(),
      userId: item.assigneeId,
      type: retryable ? 'failed_retryable' : 'failed_permanent',
      title: retryable ? 'Falha temporária na publicação' : 'Falha permanente',
      body: pe.message,
      read: false,
      createdAt: nowIso(),
    })
    await saveNotifications(kv, notes)

    return { ok: false, error: pe.message }
  }
}

export async function processDueJobs(
  kv: MarketingKv,
  env: {
    TOKEN_ENCRYPTION_KEY: string
    META_APP_ID?: string
    META_APP_SECRET?: string
    INSTAGRAM_REDIRECT_URI?: string
    META_GRAPH_VERSION?: string
  },
) {
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`
  const contents = await listContent(kv)
  const jobs = await listJobs(kv)
  const now = Date.now()
  let contentDirty = false
  let jobsDirty = false

  for (const c of contents) {
    if (c.deletedAt) continue
    if (
      c.status === 'SCHEDULED' &&
      c.scheduledAt &&
      new Date(c.scheduledAt).getTime() <= now
    ) {
      try {
        assertTransition(c.status, 'QUEUED')
        c.status = 'QUEUED'
        c.updatedAt = nowIso()
        contentDirty = true
      } catch {
        continue
      }
      const existing = jobs.find(
        (j) =>
          j.contentId === c.id &&
          (j.status === 'pending' || j.status === 'running'),
      )
      if (!existing) {
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
        jobsDirty = true
      }
    }
  }
  if (contentDirty) await saveContent(kv, contents)
  if (jobsDirty) await saveJobs(kv, jobs)

  const due = (await listJobs(kv))
    .filter(
      (j) =>
        j.status === 'pending' &&
        new Date(j.nextRunAt).getTime() <= now,
    )
    .slice(0, 5)

  const results = []
  for (const job of due) {
    results.push(await publishContentItem(kv, job.contentId, env, workerId))
  }

  // reconcilia locks travados
  const allJobs = await listJobs(kv)
  let dirty = false
  for (const j of allJobs) {
    if (
      j.status === 'running' &&
      j.lockedAt &&
      Date.now() - new Date(j.lockedAt).getTime() > 10 * 60 * 1000
    ) {
      j.status = 'pending'
      j.lockOwner = null
      j.lockedAt = null
      j.nextRunAt = nowIso()
      dirty = true
    }
  }
  if (dirty) await saveJobs(kv, allJobs)

  return { processed: results.length, results }
}
