import type {
  AppNotification,
  AuditLog,
  ContentFormat,
  ContentItem,
  ContentStatus,
  DistributionMode,
  MediaAsset,
  PublicSocialAccount,
  ScheduleRuleInput,
} from '@shared/marketing'
import { getToken, clearToken } from './api'

const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  'http://localhost:8787'

export type MarketingAccountResponse = {
  ok: boolean
  account: PublicSocialAccount | null
  config: {
    configured: boolean
    missing: string[]
    scopes: string[]
    graphVersion: string
    redirectUri: string | null
    mode: string
    appIdMasked?: string | null
    hasAppSecret?: boolean
    setupHint?: string
    oauthRedirectToRegister?: string
    lastOAuthError?: { reason: string; at: string } | null
  }
  limits: { usage: number | null; total: number } | null
  timezone: string
}

export type ContentListItem = ContentItem & {
  mediaDetails?: MediaAsset[]
  thumb?: string
}

async function api<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API_URL}${path}${sep}_=${Date.now()}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  if (res.status === 401 && auth) {
    clearToken()
    throw new Error('unauthorized')
  }
  if (res.redirected && res.url.includes('instagram.com')) {
    window.location.href = res.url
    throw new Error('redirect')
  }
  if (!res.ok) {
    let message = `API ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    return {} as T
  }
  return (await res.json()) as T
}

export function instagramConnectUrl() {
  const token = getToken()
  return `${API_URL}/oauth/instagram/start?access_token=${encodeURIComponent(token)}`
}

/** Inicia OAuth oficial: obtém URL autorizada no backend e redireciona. */
export async function startInstagramOAuth() {
  const data = await api<{ ok: boolean; url: string }>('/marketing/oauth/url')
  if (!data.url) throw new Error('URL OAuth indisponível')
  window.location.href = data.url
}

export async function fetchMarketingAccount() {
  return api<MarketingAccountResponse>('/marketing/account')
}

export async function saveMetaConfig(input: {
  appId: string
  appSecret: string
  redirectUri?: string
}) {
  return api<{ ok: boolean; config: MarketingAccountResponse['config'] }>(
    '/marketing/meta-config',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function disconnectInstagram() {
  return api<{ ok: boolean }>('/marketing/account/disconnect', { method: 'POST' })
}

export async function syncInstagramAccount() {
  return api<{
    ok: boolean
    account: PublicSocialAccount
    warnings?: string[]
  }>('/marketing/account/sync', { method: 'POST' })
}

export async function fetchMarketingSummary() {
  return api<{
    ok: boolean
    summary: {
      today: number
      upcoming: number
      drafts: number
      processing: number
      errors: number
      published: number
    }
    connectionStatus: string
  }>('/marketing/summary')
}

export async function fetchMediaLibrary(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ''
  const data = await api<{ ok: boolean; media: MediaAsset[] }>(
    `/marketing/media${qs}`,
  )
  return data.media || []
}

export async function uploadMedia(file: File, onProgress?: (pct: number) => void) {
  const form = new FormData()
  form.append('file', file)
  onProgress?.(10)
  const token = getToken()
  const res = await fetch(`${API_URL}/marketing/media/upload?_=${Date.now()}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  onProgress?.(90)
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `Upload falhou (${res.status})`)
  }
  onProgress?.(100)
  const data = (await res.json()) as { media: MediaAsset; deduped?: boolean }
  return data
}

export async function deleteMedia(id: string) {
  return api<{ ok: boolean }>(`/marketing/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function fetchContent(params: {
  status?: string
  format?: ContentFormat | ''
  q?: string
  page?: number
  pageSize?: number
  from?: string
  to?: string
}) {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.format) sp.set('format', params.format)
  if (params.q) sp.set('q', params.q)
  if (params.page) sp.set('page', String(params.page))
  if (params.pageSize) sp.set('pageSize', String(params.pageSize))
  if (params.from) sp.set('from', params.from)
  if (params.to) sp.set('to', params.to)
  return api<{
    ok: boolean
    total: number
    page: number
    pageSize: number
    items: ContentListItem[]
  }>(`/marketing/content?${sp}`)
}

export async function createContent(input: {
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
  timezone?: string
}) {
  return api<{ ok: boolean; content: ContentItem; publish?: { ok: boolean; error?: string } }>(
    '/marketing/content',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function updateContent(
  id: string,
  patch: Partial<ContentItem> & { mediaIds?: string[] },
) {
  return api<{ ok: boolean; content: ContentItem }>(
    `/marketing/content/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function contentAction(
  id: string,
  action: 'duplicate' | 'cancel' | 'retry' | 'publish',
) {
  return api<{ ok: boolean; content: ContentItem }>(
    `/marketing/content/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' },
  )
}

export async function deleteContent(id: string) {
  return api<{ ok: boolean }>(`/marketing/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function fetchCalendar(from: string, to: string) {
  return api<{
    ok: boolean
    timezone: string
    items: ContentListItem[]
  }>(
    `/marketing/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )
}

export async function previewSchedule(count: number, rule: ScheduleRuleInput) {
  return api<{ ok: boolean; schedule: string[] }>('/marketing/schedule/preview', {
    method: 'POST',
    body: JSON.stringify({ count, rule }),
  })
}

export async function createBatch(input: {
  items: {
    mediaId: string
    format: ContentFormat
    caption?: string
    hashtags?: string
    internalNote?: string
    scheduledAt?: string | null
  }[]
  rule: ScheduleRuleInput
  defaultCaption?: string
  defaultHashtags?: string
}) {
  return api<{ ok: boolean; contents: ContentItem[]; schedule: string[] }>(
    '/marketing/content/batch',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function bulkContent(
  action: 'cancel' | 'delete_drafts' | 'reschedule',
  ids: string[],
  scheduledAt?: string,
) {
  return api<{ ok: boolean; count: number }>('/marketing/content/bulk', {
    method: 'POST',
    body: JSON.stringify({ action, ids, scheduledAt }),
  })
}

export async function fetchNotifications() {
  const data = await api<{ ok: boolean; notifications: AppNotification[] }>(
    '/marketing/notifications',
  )
  return data.notifications || []
}

export async function fetchAudit() {
  const data = await api<{ ok: boolean; logs: AuditLog[] }>('/marketing/audit')
  return data.logs || []
}

export async function fetchContentDetail(id: string) {
  return api<{
    ok: boolean
    content: ContentItem
    media: MediaAsset[]
    attempts: unknown[]
    insights: {
      metrics: { name: string; values: unknown[] }[]
      fetchedAt: string
    } | null
  }>(`/marketing/content/${encodeURIComponent(id)}`)
}

export type { ContentFormat, ContentStatus, DistributionMode, MediaAsset, ContentItem }
