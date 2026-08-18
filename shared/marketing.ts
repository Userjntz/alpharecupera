/** Tipos e regras puras do Painel de Marketing (Instagram). */

export const GRAPH_API_VERSION = 'v22.0'
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
export const CAPTION_MAX = 2200
export const DAILY_PUBLISH_LIMIT = 50

export const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
] as const

/** Escopos mínimos só para conectar (se publish ainda não foi adicionado no app). */
export const IG_SCOPES_CONNECT = ['instagram_business_basic'] as const

export type ContentFormat =
  | 'FEED_IMAGE'
  | 'FEED_VIDEO'
  | 'CAROUSEL'
  | 'REEL'
  | 'STORY_IMAGE'
  | 'STORY_VIDEO'

export type ContentStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PREPARING'
  | 'PROCESSING_MEDIA'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'CANCELLED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'

export type SocialAccountStatus =
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'missing_permissions'
  | 'disconnected'

export type MediaKind = 'image' | 'video'

export type DistributionMode =
  | 'manual'
  | 'fixed_interval'
  | 'max_per_day'
  | 'custom_slots'

export const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ['SCHEDULED', 'QUEUED', 'CANCELLED'],
  SCHEDULED: ['QUEUED', 'DRAFT', 'PAUSED', 'CANCELLED'],
  QUEUED: ['PREPARING', 'PAUSED', 'CANCELLED', 'FAILED_RETRYABLE'],
  PREPARING: [
    'PROCESSING_MEDIA',
    'PUBLISHING',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'CANCELLED',
  ],
  PROCESSING_MEDIA: [
    'PUBLISHING',
    'FAILED_RETRYABLE',
    'FAILED_PERMANENT',
    'CANCELLED',
  ],
  PUBLISHING: ['PUBLISHED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'],
  PUBLISHED: [],
  PAUSED: ['SCHEDULED', 'QUEUED', 'DRAFT', 'CANCELLED'],
  CANCELLED: ['DRAFT'],
  FAILED_RETRYABLE: ['QUEUED', 'SCHEDULED', 'CANCELLED', 'DRAFT'],
  FAILED_PERMANENT: ['DRAFT', 'CANCELLED'],
}

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return true
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: ContentStatus, to: ContentStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} → ${to}`)
  }
}

export type ContentMediaRef = {
  mediaId: string
  position: number
}

export type ContentItem = {
  id: string
  accountId: string
  format: ContentFormat
  caption: string
  hashtags: string
  altText?: string
  coverUrl?: string
  internalNote?: string
  timezone: string
  scheduledAt: string | null
  publishedAt: string | null
  status: ContentStatus
  authorId: string
  authorName: string
  assigneeId: string
  assigneeName: string
  externalId?: string
  permalink?: string
  containerId?: string
  idempotencyKey: string
  attempts: number
  lastErrorCode?: string
  lastErrorMessage?: string
  media: ContentMediaRef[]
  deletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type MediaAsset = {
  id: string
  uploaderId: string
  uploaderName: string
  storageKey: string
  publicUrl: string
  mime: string
  kind: MediaKind
  hash: string
  size: number
  width?: number
  height?: number
  durationSec?: number
  thumbnailUrl?: string
  validationStatus: 'pending' | 'valid' | 'invalid'
  validationErrors: string[]
  usedByContentIds: string[]
  deletedAt?: string | null
  createdAt: string
}

export type SocialAccount = {
  id: string
  provider: 'instagram'
  externalUserId: string
  username: string
  accountType: string
  profilePictureUrl?: string
  scopes: string[]
  tokenExpiresAt: string | null
  status: SocialAccountStatus
  lastSyncedAt: string | null
  /** Token criptografado — nunca enviar ao frontend */
  encryptedAccessToken?: string
  createdAt: string
  updatedAt: string
}

export type PublicSocialAccount = Omit<SocialAccount, 'encryptedAccessToken'>

export type PublicationJob = {
  id: string
  contentId: string
  idempotencyKey: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  attempts: number
  maxAttempts: number
  nextRunAt: string
  lockedAt: string | null
  lockOwner: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export type PublicationAttempt = {
  id: string
  contentId: string
  jobId: string
  startedAt: string
  finishedAt: string | null
  ok: boolean
  errorCode?: string
  errorMessage?: string
  retryable?: boolean
}

export type AuditLog = {
  id: string
  actorId: string
  actorName: string
  action: string
  objectType: string
  objectId: string
  meta?: Record<string, unknown>
  createdAt: string
}

export type AppNotification = {
  id: string
  userId: string | null
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export type ContentInsight = {
  contentId: string
  externalId: string
  metrics: { name: string; period?: string; values: unknown[] }[]
  fetchedAt: string
}

export type ScheduleRuleInput = {
  mode: DistributionMode
  days: number[]
  windowStart: string
  windowEnd: string
  includeWeekends: boolean
  intervalMinutes?: number
  maxPerDay?: number
  customSlots?: string[]
  timezone: string
  manualTimes?: (string | null)[]
}

export type BatchItemInput = {
  mediaId: string
  format: ContentFormat
  caption?: string
  hashtags?: string
  /** Nota interna — útil em stories (API não envia legenda no Instagram) */
  internalNote?: string
  scheduledAt?: string | null
}

const PAD_DAY = (n: number) => String(n).padStart(2, '0')

/** Converte "YYYY-MM-DDTHH:mm" no fuso indicado para ISO UTC. */
export function zonedLocalToUtcIso(
  localDateTime: string,
  timeZone: string,
): string {
  const m = localDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (!m) throw new Error('Data/hora inválida')
  const [, ys, mos, ds, hs, mis, ss] = m
  const year = Number(ys)
  const month = Number(mos)
  const day = Number(ds)
  const hour = Number(hs)
  const minute = Number(mis)
  const second = Number(ss || '0')

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(new Date(utcGuess))
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || '0')
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  const offset = asIfUtc - utcGuess
  return new Date(utcGuess - offset).toISOString()
}

export function formatInTimeZone(iso: string, timeZone: string): string {
  const d = new Date(iso)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map(Number)
  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    throw new Error(`Horário inválido: ${hm}`)
  }
  return { h, m }
}

function ymdInZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(date)
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${PAD_DAY(dt.getUTCMonth() + 1)}-${PAD_DAY(dt.getUTCDate())}`
}

function weekdayOfYmd(ymd: string, timeZone: string): number {
  const iso = zonedLocalToUtcIso(`${ymd}T12:00`, timeZone)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  })
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[formatter.format(new Date(iso))] ?? 0
}

/**
 * Distribui N itens ao longo dos dias/horários permitidos.
 * Retorna ISO UTC por item (mesma ordem de entrada).
 */
export function distributeSchedule(
  count: number,
  rule: ScheduleRuleInput,
  occupiedUtc: string[] = [],
  fromDateYmd?: string,
): string[] {
  if (count <= 0) return []
  const timezone = rule.timezone || DEFAULT_TIMEZONE
  const startHm = parseHm(rule.windowStart)
  const endHm = parseHm(rule.windowEnd)
  const windowStartMin = startHm.h * 60 + startHm.m
  const windowEndMin = endHm.h * 60 + endHm.m
  if (windowEndMin <= windowStartMin) {
    throw new Error('Janela inválida: horário final deve ser após o inicial')
  }

  const allowedDays = new Set(
    (rule.days?.length ? rule.days : [1, 2, 3, 4, 5]).filter((d) =>
      rule.includeWeekends ? true : d !== 0 && d !== 6,
    ),
  )
  if (!rule.includeWeekends) {
    allowedDays.delete(0)
    allowedDays.delete(6)
  }

  const occupied = new Set(
    occupiedUtc.map((iso) => formatInTimeZone(iso, timezone)),
  )

  if (rule.mode === 'manual' && rule.manualTimes) {
    return rule.manualTimes.map((t, i) => {
      if (!t) throw new Error(`Horário manual ausente no item ${i + 1}`)
      const utc = t.includes('Z') || t.includes('+') ? t : zonedLocalToUtcIso(t, timezone)
      const local = formatInTimeZone(utc, timezone)
      if (occupied.has(local)) {
        throw new Error(`Conflito de horário: ${local}`)
      }
      occupied.add(local)
      return new Date(utc).toISOString()
    })
  }

  const slots: string[] = []
  let cursorYmd = fromDateYmd || ymdInZone(new Date(), timezone)
  let guard = 0
  const maxDays = 366

  const slotMinutes = (): number[] => {
    if (rule.mode === 'custom_slots' && rule.customSlots?.length) {
      return rule.customSlots.map((s) => {
        const { h, m } = parseHm(s)
        const min = h * 60 + m
        if (min < windowStartMin || min > windowEndMin) {
          throw new Error(`Slot ${s} fora da janela`)
        }
        return min
      })
    }
    if (rule.mode === 'fixed_interval') {
      const step = Math.max(15, rule.intervalMinutes || 120)
      const out: number[] = []
      for (let t = windowStartMin; t <= windowEndMin; t += step) out.push(t)
      return out.length ? out : [windowStartMin]
    }
    if (rule.mode === 'max_per_day') {
      const max = Math.max(1, rule.maxPerDay || 1)
      const span = windowEndMin - windowStartMin
      const out: number[] = []
      for (let i = 0; i < max; i++) {
        out.push(windowStartMin + Math.floor((span * i) / Math.max(1, max)))
      }
      return out
    }
    const step = 120
    const out: number[] = []
    for (let t = windowStartMin; t <= windowEndMin; t += step) out.push(t)
    return out
  }

  while (slots.length < count && guard < maxDays) {
    guard++
    const wd = weekdayOfYmd(cursorYmd, timezone)
    if (allowedDays.has(wd)) {
      const daySlots = slotMinutes()
      for (const mins of daySlots) {
        if (slots.length >= count) break
        const h = Math.floor(mins / 60)
        const m = mins % 60
        const local = `${cursorYmd}T${PAD_DAY(h)}:${PAD_DAY(m)}`
        if (occupied.has(local)) continue
        const utcIso = zonedLocalToUtcIso(local, timezone)
        if (new Date(utcIso).getTime() < Date.now() - 60_000) continue
        occupied.add(local)
        slots.push(utcIso)
      }
    }
    cursorYmd = addDaysYmd(cursorYmd, 1)
  }

  if (slots.length < count) {
    throw new Error(
      `Não foi possível alocar ${count} horários com as regras atuais (gerados: ${slots.length})`,
    )
  }
  return slots
}

export function combineCaption(caption: string, hashtags: string): string {
  const c = (caption || '').trim()
  const h = (hashtags || '').trim()
  if (!h) return c
  if (!c) return h
  return `${c}\n\n${h}`
}

export function validateCaption(caption: string, hashtags: string): string[] {
  const errors: string[] = []
  const full = combineCaption(caption, hashtags)
  if (full.length > CAPTION_MAX) {
    errors.push(`Legenda+hashtags excedem ${CAPTION_MAX} caracteres`)
  }
  return errors
}

export function validateFormatMedia(
  format: ContentFormat,
  media: { kind: MediaKind; mime: string; size: number; durationSec?: number }[],
): string[] {
  const errors: string[] = []
  if (!media.length) {
    errors.push('Adicione pelo menos um arquivo de mídia')
    return errors
  }
  const imgOk = (m: (typeof media)[0]) =>
    m.kind === 'image' &&
    ['image/jpeg', 'image/png'].includes(m.mime) &&
    m.size <= 8 * 1024 * 1024
  const vidOk = (m: (typeof media)[0]) =>
    m.kind === 'video' &&
    ['video/mp4', 'video/quicktime'].includes(m.mime) &&
    m.size <= 300 * 1024 * 1024 &&
    (m.durationSec == null || (m.durationSec >= 3 && m.durationSec <= 900))
  const storyVidOk = (m: (typeof media)[0]) =>
    m.kind === 'video' &&
    ['video/mp4', 'video/quicktime'].includes(m.mime) &&
    m.size <= 100 * 1024 * 1024 &&
    (m.durationSec == null || (m.durationSec >= 3 && m.durationSec <= 60))

  switch (format) {
    case 'FEED_IMAGE':
    case 'STORY_IMAGE':
      if (media.length !== 1 || !imgOk(media[0])) {
        errors.push('Este formato exige exatamente 1 imagem JPEG/PNG (máx. 8MB)')
      }
      break
    case 'STORY_VIDEO':
      if (media.length !== 1 || !storyVidOk(media[0])) {
        errors.push('Story vídeo exige 1 MP4/MOV (3–60s, máx. 100MB)')
      }
      break
    case 'FEED_VIDEO':
    case 'REEL':
      if (media.length !== 1 || !vidOk(media[0])) {
        errors.push(
          'Este formato exige exatamente 1 vídeo MP4/MOV (3s–15min, máx. 300MB)',
        )
      }
      break
    case 'CAROUSEL':
      if (media.length < 2 || media.length > 10) {
        errors.push('Carrossel exige entre 2 e 10 itens')
      }
      for (const m of media) {
        if (!(imgOk(m) || vidOk(m))) {
          errors.push('Item de carrossel inválido (imagem ou vídeo compatível)')
          break
        }
      }
      break
  }
  return errors
}

export function isRetryableProviderError(code?: string | number): boolean {
  const c = String(code || '')
  if (['1', '2', '4', '17', '32', '613', '80000', '80001', '80002'].includes(c)) {
    return true
  }
  if (c === 'RATE_LIMIT' || c === 'TIMEOUT' || c === 'NETWORK') return true
  return false
}

export function nextBackoffMs(attempt: number): number {
  const base = Math.min(60 * 60 * 1000, 2000 * 2 ** Math.max(0, attempt - 1))
  const jitter = Math.floor(Math.random() * 1000)
  return base + jitter
}

export function publicAccount(
  account: SocialAccount | null,
): PublicSocialAccount | null {
  if (!account) return null
  const { encryptedAccessToken: _, ...rest } = account
  return rest
}

export function summarizeContent(items: ContentItem[], now = Date.now()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const active = items.filter((c) => !c.deletedAt)
  const today = active.filter((c) => {
    if (!c.scheduledAt && !c.publishedAt) return false
    const t = new Date(c.publishedAt || c.scheduledAt || 0).getTime()
    return t >= start.getTime() && t < end.getTime()
  })
  return {
    today: today.length,
    upcoming: active.filter(
      (c) =>
        c.status === 'SCHEDULED' &&
        c.scheduledAt &&
        new Date(c.scheduledAt).getTime() >= now,
    ).length,
    drafts: active.filter((c) => c.status === 'DRAFT').length,
    processing: active.filter((c) =>
      ['QUEUED', 'PREPARING', 'PROCESSING_MEDIA', 'PUBLISHING'].includes(
        c.status,
      ),
    ).length,
    errors: active.filter((c) =>
      ['FAILED_RETRYABLE', 'FAILED_PERMANENT'].includes(c.status),
    ).length,
    published: active.filter((c) => c.status === 'PUBLISHED').length,
  }
}

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  FEED_IMAGE: 'Feed (imagem)',
  FEED_VIDEO: 'Feed (vídeo)',
  CAROUSEL: 'Carrossel',
  REEL: 'Reel',
  STORY_IMAGE: 'Story (imagem)',
  STORY_VIDEO: 'Story (vídeo)',
}

export const STATUS_LABELS: Record<ContentStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  QUEUED: 'Na fila',
  PREPARING: 'Preparando',
  PROCESSING_MEDIA: 'Processando mídia',
  PUBLISHING: 'Publicando',
  PUBLISHED: 'Publicado',
  PAUSED: 'Pausado',
  CANCELLED: 'Cancelado',
  FAILED_RETRYABLE: 'Falha (pode tentar)',
  FAILED_PERMANENT: 'Falha permanente',
}
