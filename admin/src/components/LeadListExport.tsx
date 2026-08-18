import { useMemo, useState } from 'react'
import { Check, Download, Search, Users } from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import {
  evaluateStoredLead,
  qualityBadgeClass,
  qualityLabel,
} from '@shared/leadQuality'
import {
  buildCompleteLeadsCsv,
  buildMetaAudienceCsv,
  countByQuality,
  downloadCsv,
  exportFilename,
  filterLeadsForExport,
  type LeadExportFilter,
} from '../lib/metaAudienceCsv'
import { formatPhone } from '../lib/format'

const FILTERS: { id: LeadExportFilter; label: string; hint: string }[] = [
  { id: 'todos', label: 'Todos', hint: 'Lista inteira' },
  { id: 'bons', label: 'Bons', hint: 'Qualidade quente' },
  { id: 'medios', label: 'Médios', hint: 'Qualidade morna' },
  { id: 'ruins', label: 'Ruins', hint: 'Qualidade fria' },
  { id: 'manual', label: 'Manual', hint: 'Marcar um a um' },
]

function carLabel(lead: LeadRecord) {
  return [lead.marca, lead.modelo, lead.ano].filter(Boolean).join(' ')
}

export function LeadListExport({ leads }: { leads: LeadRecord[] }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<LeadExportFilter>('todos')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [q, setQ] = useState('')
  const [done, setDone] = useState('')

  const counts = useMemo(() => countByQuality(leads), [leads])

  const filteredManual = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return leads
    return leads.filter((l) =>
      [l.nome, l.telefone, l.marca, l.modelo, l.cidade]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [leads, q])

  const chosen = useMemo(
    () => filterLeadsForExport(leads, filter, selected),
    [leads, filter, selected],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const lead of filteredManual) next.add(lead.id)
      return next
    })
  }

  const download = (kind: 'meta' | 'completo') => {
    if (!chosen.length) return
    if (kind === 'meta') {
      const { csv, count, skipped } = buildMetaAudienceCsv(chosen)
      if (!count) {
        setDone('Nenhum lead com telefone válido para a Meta.')
        return
      }
      downloadCsv(exportFilename('meta', filter), csv)
      setDone(
        skipped
          ? `${count} contatos no CSV da Meta. ${skipped} sem telefone válido foram ignorados.`
          : `${count} contatos no CSV da Meta — pronto para enviar no Ads Manager.`,
      )
      return
    }
    const { csv, count } = buildCompleteLeadsCsv(chosen)
    downloadCsv(exportFilename('completo', filter), csv, { excelBom: true })
    setDone(`${count} linhas na planilha completa.`)
  }

  const countFor = (id: LeadExportFilter) => {
    if (id === 'todos') return counts.todos
    if (id === 'bons') return counts.bons
    if (id === 'medios') return counts.medios
    if (id === 'ruins') return counts.ruins
    return selected.size
  }

  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setDone('')
        }}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-soft/60"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-soft text-brand flex items-center justify-center shrink-0">
            <Download className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold">
              Salvar lista de leads
            </span>
            <span className="block text-xs text-muted font-medium">
              CSV no formato da Meta — todos, bons, médios, ruins ou manual
            </span>
          </span>
        </span>
        <span className="text-xs font-bold text-muted shrink-0">
          {open ? 'Fechar' : `${leads.length} leads`}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {FILTERS.map((item) => {
              const active = filter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilter(item.id)
                    setDone('')
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-brand bg-soft'
                      : 'border-line bg-white hover:bg-soft'
                  }`}
                >
                  <p className="text-sm font-extrabold">{item.label}</p>
                  <p className="text-[11px] text-muted font-medium">
                    {item.hint} · {countFor(item.id)}
                  </p>
                </button>
              )
            })}
          </div>

          {filter === 'manual' && (
            <div className="rounded-2xl border border-line overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
                <label className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar nome, carro ou telefone…"
                    className="w-full rounded-xl border border-line bg-[#fafafa] pl-9 pr-3 py-2 text-sm font-medium outline-none focus:border-brand"
                  />
                </label>
                <button
                  type="button"
                  onClick={selectVisible}
                  className="rounded-xl border border-line px-3 py-2 text-xs font-bold hover:bg-soft"
                >
                  Marcar visíveis
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-xl border border-line px-3 py-2 text-xs font-bold hover:bg-soft"
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-line">
                {filteredManual.length === 0 ? (
                  <p className="p-4 text-sm text-muted font-medium">
                    Nenhum lead nessa busca.
                  </p>
                ) : (
                  filteredManual.map((lead) => {
                    const grade = evaluateStoredLead(lead)
                    const on = selected.has(lead.id)
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => toggle(lead.id)}
                        className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left hover:bg-soft ${
                          on ? 'bg-soft' : ''
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            on
                              ? 'bg-brand border-brand text-white'
                              : 'border-line bg-white'
                          }`}
                        >
                          {on ? <Check className="w-3.5 h-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-extrabold truncate">
                              {lead.nome || 'Sem nome'}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${qualityBadgeClass(grade.quality)}`}
                            >
                              {qualityLabel(grade.quality)}
                            </span>
                          </span>
                          <span className="block text-xs text-muted font-medium truncate">
                            {formatPhone(lead.telefone)}
                            {carLabel(lead) ? ` · ${carLabel(lead)}` : ''}
                          </span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[#fffaf3] border border-line px-3.5 py-3 text-xs text-muted font-medium leading-relaxed space-y-1.5">
            <p>
              CSV no formato oficial da Meta (
              <a
                href="https://www.facebook.com/business/help/2082575038703844?id=2469097953376494"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-brand underline underline-offset-2"
              >
                guia de identificadores
              </a>
              ):{' '}
              <span className="font-bold text-ink">
                phone, fn, ln, ct, st, country
              </span>
              .
            </p>
            <p>
              Telefone com DDI (+5511…), nome e sobrenome separados, cidade por
              extenso, estado por extenso (São Paulo) e país BR. Sem colunas
              vazias para a Meta não mapear errado.
            </p>
            <p>
              Ads Manager: Públicos → Criar público → Lista de clientes →
              Enviar arquivo CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => download('meta')}
              className="inline-flex items-center gap-2 rounded-xl btn-brand px-4 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Baixar CSV Meta ({chosen.length})
            </button>
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => download('completo')}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-bold hover:bg-soft disabled:opacity-50"
            >
              <Users className="w-4 h-4" />
              Planilha completa
            </button>
          </div>

          {done ? (
            <p className="text-sm font-semibold text-ok">{done}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
