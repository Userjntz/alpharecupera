import type {
  AppNotification,
  AuditLog,
  ContentInsight,
  ContentItem,
  MediaAsset,
  PublicationAttempt,
  PublicationJob,
  SocialAccount,
} from '../../../../shared/marketing'
import { putIfChanged } from '../lib/kvWrite'

export type MarketingKv = {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
  delete?(key: string): Promise<void>
}

const KEYS = {
  account: 'ig:account',
  media: 'ig:media',
  content: 'ig:content',
  jobs: 'ig:jobs',
  attempts: 'ig:attempts',
  audit: 'ig:audit',
  notifications: 'ig:notifications',
  insights: 'ig:insights',
  oauthStates: 'ig:oauth_states',
  webhooks: 'ig:webhooks',
  metaConfig: 'ig:meta_config',
} as const

export type MetaAppConfig = {
  appId: string
  /** App Secret criptografado */
  encryptedAppSecret: string
  redirectUri?: string
  updatedAt: string
  updatedBy?: string
}

export async function getMetaConfig(
  kv: MarketingKv,
): Promise<MetaAppConfig | null> {
  const raw = await kv.get(KEYS.metaConfig)
  if (!raw) return null
  try {
    return JSON.parse(raw) as MetaAppConfig
  } catch {
    return null
  }
}

export async function saveMetaConfig(
  kv: MarketingKv,
  config: MetaAppConfig | null,
) {
  if (!config) {
    await putIfChanged(kv, KEYS.metaConfig, '')
    return
  }
  await putIfChanged(kv, KEYS.metaConfig, JSON.stringify(config))
}

async function readArray<T>(kv: MarketingKv, key: string): Promise<T[]> {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as T[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function writeArray<T>(kv: MarketingKv, key: string, items: T[]) {
  await putIfChanged(kv, key, JSON.stringify(items), { bestEffort: true })
}

export async function getAccount(kv: MarketingKv): Promise<SocialAccount | null> {
  const raw = await kv.get(KEYS.account)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SocialAccount
  } catch {
    return null
  }
}

export async function saveAccount(kv: MarketingKv, account: SocialAccount | null) {
  if (!account) {
    await putIfChanged(kv, KEYS.account, '')
    return
  }
  await putIfChanged(kv, KEYS.account, JSON.stringify(account))
}

export async function listMedia(kv: MarketingKv) {
  return readArray<MediaAsset>(kv, KEYS.media)
}

export async function saveMedia(kv: MarketingKv, items: MediaAsset[]) {
  await writeArray(kv, KEYS.media, items)
}

export async function listContent(kv: MarketingKv) {
  return readArray<ContentItem>(kv, KEYS.content)
}

export async function saveContent(kv: MarketingKv, items: ContentItem[]) {
  await writeArray(kv, KEYS.content, items)
}

export async function listJobs(kv: MarketingKv) {
  return readArray<PublicationJob>(kv, KEYS.jobs)
}

export async function saveJobs(kv: MarketingKv, items: PublicationJob[]) {
  await writeArray(kv, KEYS.jobs, items)
}

export async function listAttempts(kv: MarketingKv) {
  return readArray<PublicationAttempt>(kv, KEYS.attempts)
}

export async function saveAttempts(
  kv: MarketingKv,
  items: PublicationAttempt[],
) {
  await writeArray(kv, KEYS.attempts, items.slice(-500))
}

export async function listAudit(kv: MarketingKv) {
  return readArray<AuditLog>(kv, KEYS.audit)
}

export async function appendAudit(kv: MarketingKv, entry: AuditLog) {
  const items = await listAudit(kv)
  items.unshift(entry)
  await writeArray(kv, KEYS.audit, items.slice(0, 1000))
}

export async function listNotifications(kv: MarketingKv) {
  return readArray<AppNotification>(kv, KEYS.notifications)
}

export async function saveNotifications(
  kv: MarketingKv,
  items: AppNotification[],
) {
  await writeArray(kv, KEYS.notifications, items.slice(0, 200))
}

export async function listInsights(kv: MarketingKv) {
  return readArray<ContentInsight>(kv, KEYS.insights)
}

export async function upsertInsight(kv: MarketingKv, insight: ContentInsight) {
  const items = await listInsights(kv)
  const idx = items.findIndex((i) => i.contentId === insight.contentId)
  if (idx >= 0) items[idx] = insight
  else items.push(insight)
  await writeArray(kv, KEYS.insights, items)
}

export type OAuthStateRecord = {
  state: string
  userId: string
  createdAt: string
  expiresAt: string
}

/** State em chave própria — mais confiável que array único no KV (eventual consistency). */
export async function putOAuthState(kv: MarketingKv, rec: OAuthStateRecord) {
  const ttlSec = Math.max(
    60,
    Math.floor((new Date(rec.expiresAt).getTime() - Date.now()) / 1000),
  )
  await kv.put(`ig:oauth:${rec.state}`, JSON.stringify(rec), {
    expirationTtl: Math.min(ttlSec, 900),
  })
}

export async function consumeOAuthState(
  kv: MarketingKv,
  state: string,
): Promise<OAuthStateRecord | null> {
  const key = `ig:oauth:${state}`
  const raw = await kv.get(key)
  if (raw) {
    try {
      await kv.delete?.(key)
    } catch {
      /* ignore */
    }
    try {
      const found = JSON.parse(raw) as OAuthStateRecord
      if (new Date(found.expiresAt).getTime() < Date.now()) return null
      return found
    } catch {
      return null
    }
  }

  // Fallback legado (array antigo)
  const items = await readArray<OAuthStateRecord>(kv, KEYS.oauthStates)
  const found = items.find((s) => s.state === state)
  const next = items.filter(
    (s) => s.state !== state && new Date(s.expiresAt).getTime() > Date.now(),
  )
  if (items.length !== next.length) await writeArray(kv, KEYS.oauthStates, next)
  if (!found) return null
  if (new Date(found.expiresAt).getTime() < Date.now()) return null
  return found
}

export type WebhookEvent = {
  id: string
  externalId: string
  processed: boolean
  createdAt: string
  payloadSummary: string
}

export async function listWebhooks(kv: MarketingKv) {
  return readArray<WebhookEvent>(kv, KEYS.webhooks)
}

export async function saveWebhooks(kv: MarketingKv, items: WebhookEvent[]) {
  await writeArray(kv, KEYS.webhooks, items.slice(-300))
}
