import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type {
  AgendaEvent,
  AgendaEventColor,
  AgendaEventType,
  NoticeLevel,
  PanelNotice,
} from '@shared/agenda'
import {
  AGENDA_COLORS,
  EVENT_TYPE_LABEL,
  NOTICE_LEVEL_LABEL,
  colorMeta,
  formatEventTime,
  todayISO,
} from '@shared/agenda'
import {
  createAgendaEvent,
  createNotice,
  deleteAgendaEvent,
  deleteNotice,
  fetchAgenda,
  fetchLeads,
  fetchNotices,
  updateAgendaEvent,
  updateNotice,
} from '../lib/api'
import type { LeadRecord } from '@shared/leads'

type CalMode = 'semana' | 'mes'

function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function toISO(d: Date) {
  return todayISO(d)
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function weekdayShort(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

function dayNum(d: Date) {
  return d.getDate()
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const emptyEventForm = (date: string): Partial<AgendaEvent> => ({
  title: '',
  description: '',
  type: 'reuniao',
  color: 'brand',
  date,
  start_time: '09:00',
  end_time: '10:00',
  all_day: false,
  location: '',
})

export function Agenda({
  embeddedPreview = false,
  onOpenFull,
}: {
  /** só o card de hoje + avisos (para dashboard) */
  embeddedPreview?: boolean
  onOpenFull?: () => void
} = {}) {
  const [mode, setMode] = useState<CalMode>('semana')
  const [expanded, setExpanded] = useState(!embeddedPreview)
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [notices, setNotices] = useState<PanelNotice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Partial<AgendaEvent> | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [noticeForm, setNoticeForm] = useState<Partial<PanelNotice> | null>(
    null,
  )
  const [showNoticesAdmin, setShowNoticesAdmin] = useState(false)
  const [clients, setClients] = useState<LeadRecord[]>([])

  const today = todayISO()

  const range = useMemo(() => {
    if (mode === 'semana') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      return { from: toISO(start), to: toISO(end), start, end }
    }
    const start = startOfMonth(cursor)
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    // grid: from Monday before month to Sunday after
    const gridStart = startOfWeek(start)
    const gridEnd = addDays(startOfWeek(end), 6)
    return {
      from: toISO(gridStart),
      to: toISO(gridEnd),
      start: gridStart,
      end: gridEnd,
      monthStart: start,
    }
  }, [cursor, mode])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const from = embeddedPreview && !expanded ? today : range.from
      const to = embeddedPreview && !expanded ? today : range.to
      const [ev, nt] = await Promise.all([
        fetchAgenda(from, to),
        fetchNotices(embeddedPreview ? true : false),
      ])
      setEvents(ev)
      setNotices(nt)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível carregar a agenda. Tente de novo.',
      )
    } finally {
      if (!silent) setLoading(false)
    }
  }, [embeddedPreview, expanded, range.from, range.to, today])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!editing) return
    void fetchLeads()
      .then((list) => setClients(list))
      .catch(() => setClients([]))
  }, [editing])

  const todayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === today)
        .sort((a, b) =>
          String(a.start_time || '').localeCompare(String(b.start_time || '')),
        ),
    [events, today],
  )

  const activeNotices = useMemo(
    () => notices.filter((n) => n.active !== false),
    [notices],
  )

  const days = useMemo(() => {
    const list: Date[] = []
    let d = new Date(range.start)
    const end = range.end
    while (d <= end) {
      list.push(new Date(d))
      d = addDays(d, 1)
    }
    return list
  }, [range.start, range.end])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const e of events) {
      const arr = map.get(e.date) || []
      arr.push(e)
      map.set(e.date, arr)
    }
    for (const [, arr] of map) {
      arr.sort((a, b) =>
        String(a.start_time || '').localeCompare(String(b.start_time || '')),
      )
    }
    return map
  }, [events])

  const openCreate = (date = today) => {
    setEditingId(null)
    setEditing(emptyEventForm(date))
  }

  const openEdit = (ev: AgendaEvent) => {
    setEditingId(ev.id)
    setEditing({ ...ev })
  }

  const saveEvent = async () => {
    if (!editing?.title?.trim()) {
      setError('Informe o título da reunião.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        const updated = await updateAgendaEvent(editingId, editing)
        setEvents((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        )
      } else {
        const created = await createAgendaEvent(editing)
        if (!created?.id) throw new Error('A API não devolveu o compromisso.')
        setEvents((prev) => {
          if (prev.some((e) => e.id === created.id)) return prev
          return [...prev, created]
        })
      }
      setEditing(null)
      setEditingId(null)
      void load(true)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Não foi possível salvar o compromisso',
      )
    } finally {
      setSaving(false)
    }
  }

  const removeEvent = async (id: string) => {
    if (!window.confirm('Excluir este compromisso?')) return
    setSaving(true)
    try {
      await deleteAgendaEvent(id)
      setEvents((prev) => prev.filter((e) => e.id !== id))
      if (editingId === id) {
        setEditing(null)
        setEditingId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir')
    } finally {
      setSaving(false)
    }
  }

  const saveNotice = async () => {
    if (!noticeForm?.title?.trim()) return
    setSaving(true)
    try {
      if (noticeForm.id) {
        const updated = await updateNotice(noticeForm.id, noticeForm)
        setNotices((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        )
      } else {
        const created = await createNotice({
          ...noticeForm,
          active: noticeForm.active ?? true,
          pinned: noticeForm.pinned ?? true,
          level: (noticeForm.level as NoticeLevel) || 'info',
        })
        setNotices((prev) => [created, ...prev])
      }
      setNoticeForm(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no aviso')
    } finally {
      setSaving(false)
    }
  }

  const removeNotice = async (id: string) => {
    if (!window.confirm('Excluir este aviso?')) return
    await deleteNotice(id)
    setNotices((prev) => prev.filter((n) => n.id !== id))
  }

  const toggleNoticeActive = async (n: PanelNotice) => {
    const updated = await updateNotice(n.id, { active: !n.active })
    setNotices((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
  }

  const expand = () => {
    if (onOpenFull) {
      onOpenFull()
      return
    }
    setExpanded(true)
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
          {error}
        </div>
      ) : null}

      {/* Avisos do painel */}
      {activeNotices.length > 0 || !embeddedPreview ? (
        <div className="space-y-2">
          {activeNotices.slice(0, embeddedPreview ? 3 : 8).map((n) => (
            <NoticeBanner key={n.id} notice={n} />
          ))}
          {!embeddedPreview ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setNoticeForm({
                    title: '',
                    body: '',
                    level: 'aviso',
                    active: true,
                    pinned: true,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold hover:bg-soft"
              >
                <Bell className="w-3.5 h-3.5" />
                Novo aviso
              </button>
              <button
                type="button"
                onClick={() => setShowNoticesAdmin((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold hover:bg-soft"
              >
                Gerenciar avisos
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showNoticesAdmin && !embeddedPreview ? (
        <div className="rounded-2xl border border-line bg-white p-4 space-y-2">
          <p className="text-sm font-extrabold">Avisos</p>
          {notices.length === 0 ? (
            <p className="text-sm text-muted">Nenhum aviso criado.</p>
          ) : (
            notices.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  {NOTICE_LEVEL_LABEL[n.level]}
                </span>
                <p className="text-sm font-bold flex-1 min-w-0 truncate">
                  {n.title}
                </p>
                <button
                  type="button"
                  onClick={() => void toggleNoticeActive(n)}
                  className="text-xs font-bold text-brand"
                >
                  {n.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => setNoticeForm(n)}
                  className="text-xs font-bold"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void removeNotice(n.id)}
                  className="text-muted hover:text-bad"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Preview card de hoje */}
      <button
        type="button"
        onClick={expand}
        className="w-full text-left rounded-3xl border border-line bg-gradient-to-br from-[#fff8f1] via-white to-[#fff1e6] p-5 sm:p-6 hover:border-[#ffd7a8] transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
              Agenda de hoje
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight capitalize">
              {parseISODate(today).toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-line px-3 py-1.5 text-xs font-bold text-muted">
            <CalendarDays className="w-3.5 h-3.5 text-brand" />
            {loading
              ? '…'
              : `${todayEvents.length} compromisso${todayEvents.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {loading && todayEvents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando…
          </div>
        ) : todayEvents.length === 0 ? (
          <p className="text-sm text-muted font-medium">
            Nada marcado para hoje. Clique para abrir a agenda completa.
          </p>
        ) : (
          <ul className="space-y-2">
            {todayEvents.slice(0, embeddedPreview ? 4 : 6).map((ev) => {
              const c = colorMeta(ev.color)
              return (
                <li
                  key={ev.id}
                  className={`flex items-start gap-3 rounded-2xl border px-3.5 py-2.5 ${c.soft}`}
                >
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold truncate">{ev.title}</p>
                    <p className="text-[11px] font-semibold text-muted mt-0.5">
                      {EVENT_TYPE_LABEL[ev.type]} · {formatEventTime(ev)}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <p className="mt-4 text-xs font-bold text-brand">
          {expanded ? 'Agenda aberta abaixo ↓' : 'Abrir semana / mês →'}
        </p>
      </button>

      {expanded && !embeddedPreview ? (
        <>
          <div className="rounded-2xl border border-line bg-white p-3 sm:p-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line overflow-hidden">
              {(['semana', 'mes'] as CalMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3.5 py-2 text-xs font-bold capitalize ${
                    mode === m ? 'bg-brand text-white' : 'bg-white text-muted hover:bg-soft'
                  }`}
                >
                  {m === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={() =>
                  setCursor((c) =>
                    mode === 'semana'
                      ? addDays(c, -7)
                      : new Date(c.getFullYear(), c.getMonth() - 1, 1),
                  )
                }
                className="rounded-lg border border-line p-2 hover:bg-soft"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date())}
                className="rounded-lg border border-line px-3 py-2 text-xs font-bold hover:bg-soft"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() =>
                  setCursor((c) =>
                    mode === 'semana'
                      ? addDays(c, 7)
                      : new Date(c.getFullYear(), c.getMonth() + 1, 1),
                  )
                }
                className="rounded-lg border border-line p-2 hover:bg-soft"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <p className="w-full sm:w-auto text-sm font-extrabold capitalize sm:order-first">
              {mode === 'mes'
                ? monthLabel(cursor)
                : `${range.from.slice(8)}/${range.from.slice(5, 7)} – ${range.to.slice(8)}/${range.to.slice(5, 7)}`}
            </p>
            <button
              type="button"
              onClick={() => openCreate(today)}
              className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo
            </button>
          </div>

          {mode === 'semana' ? (
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
              {days.map((d) => {
                const iso = toISO(d)
                const list = eventsByDate.get(iso) || []
                const isToday = sameDay(d, new Date())
                return (
                  <div
                    key={iso}
                    className={`rounded-2xl border bg-white min-h-[160px] flex flex-col ${
                      isToday ? 'border-brand' : 'border-line'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openCreate(iso)}
                      className="px-2.5 py-2 border-b border-line text-left hover:bg-soft rounded-t-2xl"
                    >
                      <p className="text-[10px] font-bold uppercase text-muted">
                        {weekdayShort(d)}
                      </p>
                      <p
                        className={`text-lg font-extrabold ${
                          isToday ? 'text-brand' : ''
                        }`}
                      >
                        {dayNum(d)}
                      </p>
                    </button>
                    <div className="p-1.5 space-y-1 flex-1">
                      {list.map((ev) => {
                        const c = colorMeta(ev.color)
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => openEdit(ev)}
                            className={`w-full text-left rounded-lg border px-2 py-1.5 ${c.soft}`}
                          >
                            <p className="text-[11px] font-extrabold truncate">
                              {ev.title}
                            </p>
                            <p className="text-[10px] font-semibold text-muted">
                              {formatEventTime(ev)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-white overflow-hidden">
              <div className="grid grid-cols-7 border-b border-line bg-[#fafafa]">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((w) => (
                  <div
                    key={w}
                    className="px-1 py-2 text-center text-[10px] font-bold uppercase text-muted"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((d) => {
                  const iso = toISO(d)
                  const list = eventsByDate.get(iso) || []
                  const inMonth = d.getMonth() === cursor.getMonth()
                  const isToday = sameDay(d, new Date())
                  return (
                    <div
                      key={iso}
                      className={`min-h-[96px] border-b border-r border-line p-1.5 ${
                        inMonth ? 'bg-white' : 'bg-[#fafafa]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openCreate(iso)}
                        className={`w-7 h-7 rounded-lg text-xs font-extrabold mb-1 ${
                          isToday
                            ? 'bg-brand text-white'
                            : inMonth
                              ? 'text-ink hover:bg-soft'
                              : 'text-muted'
                        }`}
                      >
                        {dayNum(d)}
                      </button>
                      <div className="space-y-0.5">
                        {list.slice(0, 3).map((ev) => {
                          const c = colorMeta(ev.color)
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => openEdit(ev)}
                              className={`w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-bold ${c.soft}`}
                            >
                              {ev.title}
                            </button>
                          )
                        })}
                        {list.length > 3 ? (
                          <p className="text-[10px] font-bold text-muted px-1">
                            +{list.length - 3}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : null}

      {editing ? (
        <EventModal
          form={editing}
          setForm={setEditing}
          saving={saving}
          isEdit={Boolean(editingId)}
          clients={clients}
          error={error}
          onClose={() => {
            setEditing(null)
            setEditingId(null)
          }}
          onSave={() => void saveEvent()}
          onDelete={
            editingId ? () => void removeEvent(editingId) : undefined
          }
        />
      ) : null}

      {noticeForm ? (
        <NoticeModal
          form={noticeForm}
          setForm={setNoticeForm}
          saving={saving}
          onClose={() => setNoticeForm(null)}
          onSave={() => void saveNotice()}
        />
      ) : null}
    </div>
  )
}

function NoticeBanner({ notice }: { notice: PanelNotice }) {
  const styles =
    notice.level === 'urgente'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : notice.level === 'aviso'
        ? 'bg-amber-50 border-amber-200 text-amber-950'
        : 'bg-sky-50 border-sky-200 text-sky-950'
  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles}`}>
      <div className="flex items-start gap-2">
        <Bell className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{notice.title}</p>
          {notice.body ? (
            <p className="text-sm font-medium mt-0.5 opacity-90 whitespace-pre-wrap">
              {notice.body}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function EventModal({
  form,
  setForm,
  saving,
  isEdit,
  clients,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  form: Partial<AgendaEvent>
  setForm: (f: Partial<AgendaEvent>) => void
  saving: boolean
  isEdit: boolean
  clients: LeadRecord[]
  error?: string
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
}) {
  const set = <K extends keyof AgendaEvent>(k: K, v: AgendaEvent[K]) =>
    setForm({ ...form, [k]: v })

  const pickClient = (id: string) => {
    const lead = clients.find((c) => c.id === id)
    setForm({
      ...form,
      lead_id: id || undefined,
      lead_name: lead?.nome || '',
      title:
        form.title?.trim() && form.title !== 'Reunião'
          ? form.title
          : lead
            ? `Reunião com ${lead.nome}`
            : form.title,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-line shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-line px-5 py-3.5 flex items-center justify-between">
          <p className="font-extrabold">
            {isEdit ? 'Editar compromisso' : 'Novo compromisso'}
          </p>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-soft">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {error ? (
            <p className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
              {error}
            </p>
          ) : null}
          <Field label="Título">
            <input
              value={form.title || ''}
              onChange={(e) => set('title', e.target.value)}
              className="field"
              placeholder="Ex.: Reunião com cliente"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select
                value={form.type || 'reuniao'}
                onChange={(e) => set('type', e.target.value as AgendaEventType)}
                className="field"
              >
                {(Object.keys(EVENT_TYPE_LABEL) as AgendaEventType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {EVENT_TYPE_LABEL[t]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Data">
              <input
                type="date"
                value={form.date || todayISO()}
                onChange={(e) => set('date', e.target.value)}
                className="field"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(form.all_day)}
              onChange={(e) => set('all_day', e.target.checked)}
            />
            Dia inteiro
          </label>
          {!form.all_day ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <input
                  type="time"
                  value={form.start_time || '09:00'}
                  onChange={(e) => set('start_time', e.target.value)}
                  className="field"
                />
              </Field>
              <Field label="Fim">
                <input
                  type="time"
                  value={form.end_time || '10:00'}
                  onChange={(e) => set('end_time', e.target.value)}
                  className="field"
                />
              </Field>
            </div>
          ) : null}
          <Field label="Cliente (opcional)">
            <select
              value={form.lead_id || ''}
              onChange={(e) => pickClient(e.target.value)}
              className="field"
            >
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome || 'Sem nome'}
                  {[c.marca, c.modelo].filter(Boolean).length
                    ? ` · ${[c.marca, c.modelo].filter(Boolean).join(' ')}`
                    : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Local">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                value={form.location || ''}
                onChange={(e) => set('location', e.target.value)}
                className="field pl-9"
                placeholder="Opcional"
              />
            </div>
          </Field>
          <Field label="Descrição">
            <textarea
              value={form.description || ''}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="field resize-y"
            />
          </Field>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {AGENDA_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set('color', c.id as AgendaEventColor)}
                  className={`w-8 h-8 rounded-full ${c.bg} ${
                    form.color === c.id
                      ? 'ring-2 ring-offset-2 ring-ink'
                      : ''
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </Field>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-line px-5 py-3.5 flex flex-wrap gap-2 justify-between">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-bad hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line px-4 py-2 text-xs font-bold hover:bg-soft"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.title?.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-4 py-2 text-xs disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .field {
          width: 100%;
          margin-top: 0.25rem;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          background: #fafafa;
          padding: 0.55rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .field:focus {
          outline: none;
          border-color: #ff6a00;
          background: #fff;
        }
      `}</style>
    </div>
  )
}

function NoticeModal({
  form,
  setForm,
  saving,
  onClose,
  onSave,
}: {
  form: Partial<PanelNotice>
  setForm: (f: Partial<PanelNotice>) => void
  saving: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-line p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-extrabold">
            {form.id ? 'Editar aviso' : 'Novo aviso do painel'}
          </p>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-soft">
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block text-[10px] font-bold uppercase text-muted">
          Título
          <input
            value={form.title || ''}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase text-muted">
          Mensagem
          <textarea
            value={form.body || ''}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand resize-y"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase text-muted">
          Nível
          <select
            value={form.level || 'info'}
            onChange={(e) =>
              setForm({ ...form, level: e.target.value as NoticeLevel })
            }
            className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold"
          >
            <option value="info">Info</option>
            <option value="aviso">Aviso</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.pinned !== false}
            onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
          />
          Fixar no painel
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2 text-xs font-bold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.title?.trim()}
            className="rounded-xl btn-brand px-4 py-2 text-xs disabled:opacity-60"
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wide text-muted">
      {label}
      {children}
    </label>
  )
}

/** Preview compacto para Visão Geral */
export function AgendaDashboardStrip({ onOpen }: { onOpen: () => void }) {
  return <Agenda embeddedPreview onOpenFull={onOpen} />
}