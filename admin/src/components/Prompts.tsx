import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  Copy,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import { formatPhone } from '../lib/format'

type SavedPrompt = {
  id: string
  title: string
  body: string
  builtin?: boolean
}

const STORAGE_KEY = 'alpha_captador_prompts'

const MEETING_BODY = `✅ *Reunião agendada com [Nome]*

📅 *Data:* [dia/mês]
🕒 *Horário:* [horário]
🚘 *Assunto:* Venda do veículo [modelo do carro]

Caso precise alterar o horário, avise-nos com antecedência.`

const BUILTIN: SavedPrompt[] = [
  {
    id: 'reuniao-agendada',
    title: 'Reunião agendada',
    body: MEETING_BODY,
    builtin: true,
  },
]

function carLabel(lead: LeadRecord | null) {
  if (!lead) return ''
  const parts = [lead.marca, lead.modelo, lead.ano].filter(Boolean)
  return parts.join(' ').trim()
}

function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function formatDiaMes(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}`
}

function formatHorario(hhmm: string) {
  if (!hhmm) return ''
  const [h, min] = hhmm.split(':')
  if (!h || !min) return hhmm
  return `${Number(h)}h${min}`
}

function fillTemplate(
  body: string,
  vars: {
    nome: string
    data: string
    horario: string
    modelo: string
    marca: string
    ano: string
    telefone: string
    cidade: string
  },
) {
  const pairs: [RegExp, string][] = [
    [/\[Nome\]/gi, vars.nome],
    [/\[dia\/mês\]/gi, vars.data],
    [/\[dia\/mes\]/gi, vars.data],
    [/\[horário\]/gi, vars.horario],
    [/\[horario\]/gi, vars.horario],
    [/\[modelo do carro\]/gi, vars.modelo],
    [/\[modelo\]/gi, vars.modelo],
    [/\[marca\]/gi, vars.marca],
    [/\[ano\]/gi, vars.ano],
    [/\[telefone\]/gi, vars.telefone],
    [/\[cidade\]/gi, vars.cidade],
  ]
  let out = body
  for (const [re, value] of pairs) {
    if (!value) continue
    out = out.replace(re, value)
  }
  return out
}

function loadCustom(): SavedPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is SavedPrompt =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as SavedPrompt).id === 'string' &&
          typeof (p as SavedPrompt).title === 'string' &&
          typeof (p as SavedPrompt).body === 'string',
      )
      .map((p) => ({ ...p, builtin: false }))
  } catch {
    return []
  }
}

function persistCustom(items: SavedPrompt[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(items.filter((p) => !p.builtin)),
  )
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function needsDate(body: string) {
  return /\[dia\/m[eê]s\]/i.test(body)
}

function needsTime(body: string) {
  return /\[hor[aá]rio\]/i.test(body)
}

export function Prompts({ leads }: { leads: LeadRecord[] }) {
  const [custom, setCustom] = useState<SavedPrompt[]>(() => loadCustom())
  const [selectedId, setSelectedId] = useState(BUILTIN[0].id)
  const [clientId, setClientId] = useState('')
  const [q, setQ] = useState('')
  const [date, setDate] = useState(todayISO)
  const [time, setTime] = useState('10:00')
  const [edited, setEdited] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [form, setForm] = useState<{
    id?: string
    title: string
    body: string
  } | null>(null)

  const prompts = useMemo(() => [...BUILTIN, ...custom], [custom])
  const selected = prompts.find((p) => p.id === selectedId) || prompts[0]

  const clients = useMemo(() => {
    const term = q.trim().toLowerCase()
    const sorted = [...leads].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    if (!term) return sorted
    return sorted.filter((l) =>
      [l.nome, l.marca, l.modelo, l.ano, l.telefone, l.cidade]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [leads, q])

  const client = clients.find((l) => l.id === clientId) || null

  useEffect(() => {
    if (clientId && !clients.some((l) => l.id === clientId)) {
      setClientId('')
    }
  }, [clients, clientId])

  useEffect(() => {
    setEdited(null)
  }, [selectedId, clientId, date, time])

  const filled = useMemo(() => {
    if (!selected) return ''
    return fillTemplate(selected.body, {
      nome: client?.nome || '',
      data: formatDiaMes(date),
      horario: formatHorario(time),
      modelo: carLabel(client),
      marca: client?.marca || '',
      ano: client?.ano || '',
      telefone: client ? formatPhone(client.telefone) : '',
      cidade: client?.cidade || '',
    })
  }, [selected, client, date, time])

  const preview = edited ?? filled

  const savePrompts = (next: SavedPrompt[]) => {
    setCustom(next)
    persistCustom(next)
  }

  const saveForm = () => {
    if (!form) return
    const title = form.title.trim()
    const body = form.body.trim()
    if (!title || !body) return
    if (form.id) {
      savePrompts(
        custom.map((p) => (p.id === form.id ? { ...p, title, body } : p)),
      )
      setSelectedId(form.id)
    } else {
      const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      savePrompts([...custom, { id, title, body }])
      setSelectedId(id)
    }
    setForm(null)
  }

  const removePrompt = (id: string) => {
    const next = custom.filter((p) => p.id !== id)
    savePrompts(next)
    if (selectedId === id) setSelectedId(BUILTIN[0].id)
  }

  const copyText = async () => {
    await navigator.clipboard.writeText(preview)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const waHref = useMemo(() => {
    if (!client) return null
    const phone = whatsappDigits(client.telefone)
    if (!phone) return null
    return `https://wa.me/${phone}?text=${encodeURIComponent(preview)}`
  }, [client, preview])

  const showDate = selected ? needsDate(selected.body) : false
  const showTime = selected ? needsTime(selected.body) : false

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start max-w-5xl">
      <aside className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="p-3 border-b border-line flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Mensagens salvas
          </p>
          <button
            type="button"
            onClick={() => setForm({ title: '', body: '' })}
            className="inline-flex items-center gap-1 rounded-lg bg-soft px-2 py-1 text-[11px] font-bold hover:bg-[#ffe8cc]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
          {prompts.map((p) => {
            const active = p.id === selected?.id
            return (
              <div
                key={p.id}
                className={`flex items-start gap-1 ${active ? 'bg-soft' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="flex-1 min-w-0 text-left px-3.5 py-3 hover:bg-soft transition-colors"
                >
                  <p className="text-sm font-extrabold truncate">{p.title}</p>
                  <p className="text-xs text-muted font-medium truncate mt-0.5">
                    {p.body.replace(/\s+/g, ' ')}
                  </p>
                </button>
                {!p.builtin && (
                  <div className="flex flex-col pr-2 py-2">
                    <button
                      type="button"
                      title="Editar"
                      onClick={() =>
                        setForm({ id: p.id, title: p.title, body: p.body })
                      }
                      className="p-1.5 rounded-lg hover:bg-white text-muted"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Excluir"
                      onClick={() => removePrompt(p.id)}
                      className="p-1.5 rounded-lg hover:bg-white text-muted"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-soft text-brand flex items-center justify-center shrink-0">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight">
                {selected?.title || 'Prompt'}
              </h2>
              <p className="text-sm text-muted font-medium mt-0.5">
                Selecione o cliente, confira o texto e copie para o WhatsApp.
              </p>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Cliente
            </span>
            <div className="rounded-2xl border border-line overflow-hidden focus-within:border-brand">
              <div className="flex items-center gap-2 px-3 border-b border-line/80">
                <Search className="w-4 h-4 text-muted shrink-0" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nome, carro ou telefone…"
                  className="w-full bg-transparent outline-none text-sm font-medium placeholder:text-muted/80 py-2.5"
                />
              </div>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-white px-3 py-2.5 text-sm font-semibold outline-none"
              >
                <option value="">Sem cliente — placeholders no texto</option>
                {clients.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome || 'Sem nome'}
                    {carLabel(l) ? ` · ${carLabel(l)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {client && (
            <div className="rounded-xl bg-soft px-3.5 py-2.5 text-sm font-medium">
              <p className="font-extrabold">{client.nome || 'Sem nome'}</p>
              <p className="text-muted text-xs mt-0.5">
                {[formatPhone(client.telefone), carLabel(client), client.cidade]
                  .filter(Boolean)
                  .join(' · ') || 'Sem dados extras'}
              </p>
            </div>
          )}

          {(showDate || showTime) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {showDate && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Data
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand"
                  />
                </label>
              )}
              {showTime && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">
                    Horário
                  </span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold outline-none focus:border-brand"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Prévia para o Zap
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyText()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-soft"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-ok" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted" />
                )}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-3 py-1.5 text-xs font-semibold"
                >
                  Abrir no Zap
                </a>
              )}
            </div>
          </div>
          <textarea
            value={preview}
            onChange={(e) => setEdited(e.target.value)}
            rows={10}
            className="w-full rounded-2xl rounded-tl-md bg-[#e7f8ee] border border-[#cfeedd] px-4 py-3 text-[13px] sm:text-sm font-medium leading-relaxed text-[#14532d] outline-none resize-y min-h-[180px]"
          />
          <p className="text-xs text-muted font-medium">
            Placeholders: [Nome], [dia/mês], [horário], [modelo do carro],
            [marca], [ano], [telefone], [cidade]. Pode editar o texto antes de
            copiar.
          </p>
        </div>
      </section>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-line p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-extrabold">
                {form.id ? 'Editar mensagem' : 'Nova mensagem'}
              </p>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="p-1.5 rounded-lg hover:bg-soft"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Título
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Cobrar documentos"
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Texto
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={8}
                placeholder="Oi, [Nome]! Sobre o [modelo do carro]…"
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-medium focus:outline-none focus:border-brand resize-y"
              />
            </label>
            <p className="text-xs text-muted font-medium">
              Use [Nome] e [modelo do carro] para preencher com o cliente
              selecionado.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-xl border border-line px-3.5 py-2 text-sm font-semibold hover:bg-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveForm}
                disabled={!form.title.trim() || !form.body.trim()}
                className="rounded-xl btn-brand px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
