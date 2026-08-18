export type AgendaEventType = 'reuniao' | 'visita' | 'ligacao' | 'tarefa' | 'outro'

export type AgendaEventColor =
  | 'brand'
  | 'blue'
  | 'green'
  | 'amber'
  | 'rose'
  | 'violet'
  | 'slate'

export type AgendaEvent = {
  id: string
  title: string
  description?: string
  type: AgendaEventType
  color: AgendaEventColor
  /** YYYY-MM-DD */
  date: string
  /** HH:mm ou vazio se allDay */
  start_time: string
  end_time: string
  all_day: boolean
  location?: string
  /** Cliente/lead vinculado (opcional) */
  lead_id?: string
  lead_name?: string
  created_at: string
  updated_at: string
  created_by?: string
  created_by_name?: string
}

export type NoticeLevel = 'info' | 'aviso' | 'urgente'

export type PanelNotice = {
  id: string
  title: string
  body: string
  level: NoticeLevel
  active: boolean
  pinned: boolean
  /** ISO; null = sem expiração */
  expires_at?: string | null
  created_at: string
  updated_at: string
  created_by?: string
  created_by_name?: string
}

export const AGENDA_COLORS: {
  id: AgendaEventColor
  label: string
  bg: string
  text: string
  dot: string
  soft: string
}[] = [
  {
    id: 'brand',
    label: 'Laranja',
    bg: 'bg-[#ff6a00]',
    text: 'text-white',
    dot: 'bg-[#ff6a00]',
    soft: 'bg-[#fff4eb] border-[#ffd7a8]',
  },
  {
    id: 'blue',
    label: 'Azul',
    bg: 'bg-[#2563eb]',
    text: 'text-white',
    dot: 'bg-[#2563eb]',
    soft: 'bg-[#eff6ff] border-[#bfdbfe]',
  },
  {
    id: 'green',
    label: 'Verde',
    bg: 'bg-[#059669]',
    text: 'text-white',
    dot: 'bg-[#059669]',
    soft: 'bg-[#ecfdf5] border-[#a7f3d0]',
  },
  {
    id: 'amber',
    label: 'Amarelo',
    bg: 'bg-[#d97706]',
    text: 'text-white',
    dot: 'bg-[#d97706]',
    soft: 'bg-[#fffbeb] border-[#fde68a]',
  },
  {
    id: 'rose',
    label: 'Rosa',
    bg: 'bg-[#e11d48]',
    text: 'text-white',
    dot: 'bg-[#e11d48]',
    soft: 'bg-[#fff1f2] border-[#fecdd3]',
  },
  {
    id: 'violet',
    label: 'Roxo',
    bg: 'bg-[#7c3aed]',
    text: 'text-white',
    dot: 'bg-[#7c3aed]',
    soft: 'bg-[#f5f3ff] border-[#ddd6fe]',
  },
  {
    id: 'slate',
    label: 'Cinza',
    bg: 'bg-[#475569]',
    text: 'text-white',
    dot: 'bg-[#475569]',
    soft: 'bg-[#f8fafc] border-[#e2e8f0]',
  },
]

export const EVENT_TYPE_LABEL: Record<AgendaEventType, string> = {
  reuniao: 'Reunião',
  visita: 'Visita',
  ligacao: 'Ligação',
  tarefa: 'Tarefa',
  outro: 'Outro',
}

export const NOTICE_LEVEL_LABEL: Record<NoticeLevel, string> = {
  info: 'Info',
  aviso: 'Aviso',
  urgente: 'Urgente',
}

export function makeAgendaId(prefix = 'ev') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function todayISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isAgendaDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  )
}

export function normalizeAgendaTime(value: string) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function clip(value: string, max: number) {
  return value.slice(0, max)
}

export function colorMeta(color: AgendaEventColor) {
  return AGENDA_COLORS.find((c) => c.id === color) || AGENDA_COLORS[0]
}

export function sanitizeAgendaEvent(
  body: Record<string, unknown>,
  prev?: AgendaEvent,
): Omit<AgendaEvent, 'id' | 'created_at' | 'created_by' | 'created_by_name'> {
  const str = (k: string, fallback = '') => {
    const v = body[k]
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    return fallback
  }
  const types: AgendaEventType[] = [
    'reuniao',
    'visita',
    'ligacao',
    'tarefa',
    'outro',
  ]
  const colors = AGENDA_COLORS.map((c) => c.id)
  const typeRaw = str('type', prev?.type || 'reuniao') as AgendaEventType
  const colorRaw = str('color', prev?.color || 'brand') as AgendaEventColor
  const allDay =
    typeof body.all_day === 'boolean'
      ? body.all_day
      : prev?.all_day ?? false

  const dateRaw = str('date', prev?.date || todayISO())
  const date = isAgendaDate(dateRaw) ? dateRaw : prev?.date || todayISO()
  const start = allDay
    ? ''
    : normalizeAgendaTime(str('start_time', prev?.start_time || '09:00')) ||
      '09:00'
  const end = allDay
    ? ''
    : normalizeAgendaTime(str('end_time', prev?.end_time || '10:00')) || '10:00'
  const leadId = clip(str('lead_id', prev?.lead_id || ''), 80)
  const leadName = clip(str('lead_name', prev?.lead_name || ''), 120)

  return {
    title: clip(str('title', prev?.title || '') || 'Sem título', 200),
    description: clip(str('description', prev?.description || ''), 4000),
    type: types.includes(typeRaw) ? typeRaw : 'reuniao',
    color: colors.includes(colorRaw) ? colorRaw : 'brand',
    date,
    start_time: start,
    end_time: end,
    all_day: allDay,
    location: clip(str('location', prev?.location || ''), 200),
    lead_id: leadId || undefined,
    lead_name: leadName || undefined,
    updated_at: new Date().toISOString(),
  }
}

export function sanitizeNotice(
  body: Record<string, unknown>,
  prev?: PanelNotice,
): Omit<
  PanelNotice,
  'id' | 'created_at' | 'created_by' | 'created_by_name'
> {
  const str = (k: string, fallback = '') => {
    const v = body[k]
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    return fallback
  }
  const levels: NoticeLevel[] = ['info', 'aviso', 'urgente']
  const levelRaw = str('level', prev?.level || 'info') as NoticeLevel
  const expires =
    body.expires_at === null
      ? null
      : typeof body.expires_at === 'string'
        ? body.expires_at.trim() || null
        : prev?.expires_at ?? null

  return {
    title: clip(str('title', prev?.title || '') || 'Aviso', 200),
    body: clip(str('body', prev?.body || ''), 4000),
    level: levels.includes(levelRaw) ? levelRaw : 'info',
    active:
      typeof body.active === 'boolean' ? body.active : prev?.active ?? true,
    pinned:
      typeof body.pinned === 'boolean' ? body.pinned : prev?.pinned ?? false,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  }
}

export function isNoticeVisible(n: PanelNotice, now = new Date()) {
  if (!n.active) return false
  if (n.expires_at) {
    const t = new Date(n.expires_at).getTime()
    if (Number.isFinite(t) && t < now.getTime()) return false
  }
  return true
}

export function formatEventTime(ev: Pick<AgendaEvent, 'all_day' | 'start_time' | 'end_time'>) {
  if (ev.all_day) return 'Dia inteiro'
  if (ev.start_time && ev.end_time) return `${ev.start_time}–${ev.end_time}`
  return ev.start_time || '—'
}
