import { useMemo, useState } from 'react'
import type { LeadRecord } from '@shared/leads'
import { isLeadOpen } from '@shared/leads'
import { resolveLeadUf } from '../lib/ddd'
import {
  countByUf,
  rankBy,
  uniqueCities,
  uniqueStates,
} from '../lib/stats'
import { BrazilHeatMap } from './BrazilHeatMap'
import { RankCard } from './RankCard'
import { LeadCard } from './LeadCard'
import { CampaignLink } from './CampaignLink'
import { evaluateStoredLead } from '@shared/leadQuality'

type Period = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'tudo'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'tudo', label: 'Tudo' },
]

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function filterByPeriod(leads: LeadRecord[], period: Period) {
  if (period === 'tudo') return leads

  const now = new Date()
  const todayStart = startOfDay(now)

  let from: Date
  let to: Date = endOfDay(now)

  if (period === 'hoje') {
    from = todayStart
  } else if (period === 'ontem') {
    const y = new Date(todayStart)
    y.setDate(y.getDate() - 1)
    from = y
    to = endOfDay(y)
  } else if (period === '7d') {
    from = new Date(todayStart)
    from.setDate(from.getDate() - 6)
  } else if (period === '30d') {
    from = new Date(todayStart)
    from.setDate(from.getDate() - 29)
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const fromMs = from.getTime()
  const toMs = to.getTime()

  return leads.filter((l) => {
    const t = new Date(l.created_at).getTime()
    return t >= fromMs && t <= toMs
  })
}

function Kpi({
  value,
  label,
}: {
  value: string | number
  label: string
}) {
  return (
    <div className="rounded-2xl bg-white border border-line px-5 py-5 sm:px-6 sm:py-6 text-center shadow-[0_6px_20px_rgba(255,106,0,0.04)]">
      <p className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none text-brand-grad">
        {value}
      </p>
      <p className="mt-2 text-xs sm:text-sm font-semibold text-muted uppercase tracking-wide">
        {label}
      </p>
    </div>
  )
}

export function Dashboard({
  leads,
  captadorName,
  campaignSlug,
  showAssignee,
  onLeadUpdated,
  onBought,
}: {
  leads: LeadRecord[]
  captadorName?: string
  campaignSlug?: string
  showAssignee?: boolean
  loading?: boolean
  onLeadUpdated?: (lead: LeadRecord) => void
  onBought?: () => void
}) {
  const [period, setPeriod] = useState<Period>('hoje')

  const openLeads = useMemo(() => leads.filter(isLeadOpen), [leads])

  const filtered = useMemo(
    () => filterByPeriod(openLeads, period),
    [openLeads, period],
  )

  const graded = useMemo(
    () =>
      filtered.map((l) => ({
        lead: l,
        grade: evaluateStoredLead(l),
      })),
    [filtered],
  )
  const bons = useMemo(
    () => graded.filter((g) => g.grade.quality === 'quente'),
    [graded],
  )
  const medios = useMemo(
    () => graded.filter((g) => g.grade.quality === 'morno'),
    [graded],
  )
  const ruins = useMemo(
    () => graded.filter((g) => g.grade.quality === 'frio'),
    [graded],
  )
  const ufCounts = useMemo(() => countByUf(filtered), [filtered])

  const byBank = useMemo(
    () => rankBy(filtered, (l) => l.banco || '—'),
    [filtered],
  )
  const byUf = useMemo(
    () => rankBy(filtered, (l) => resolveLeadUf(l) || 'Sem UF'),
    [filtered],
  )
  const byCity = useMemo(
    () => rankBy(filtered, (l) => l.cidade || '—'),
    [filtered],
  )
  const recent = useMemo(() => filtered.slice(0, 4), [filtered])

  return (
    <div className="space-y-8">
      {campaignSlug ? (
        <div className="rounded-2xl border border-line bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">Seu link de campanha</p>
            <p className="text-xs text-muted">
              Leads desse link aparecem só no seu painel.
            </p>
          </div>
          <CampaignLink slug={campaignSlug} compact />
        </div>
      ) : null}
      {/* Filtro de período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted font-medium">
          Período dos dados
        </p>
        <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-white border border-line">
          {PERIODS.map((p) => {
            const active = period === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                  active
                    ? 'btn-brand shadow-none'
                    : 'text-[#4b5563] hover:bg-soft'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* KPIs no topo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Kpi value={filtered.length} label="Total leads" />
        <Kpi value={bons.length} label="Bons" />
        <Kpi value={medios.length} label="Médios" />
        <Kpi value={ruins.length} label="Ruins" />
      </div>

      {/* Métricas + mapa */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0">
          <RankCard title="Banco" items={byBank} />
          <RankCard title="UF / Estado" items={byUf} />
          <RankCard title="Cidades" items={byCity} />
        </div>

        <aside className="rounded-2xl bg-white border border-line p-5 sm:p-6 shadow-[0_6px_20px_rgba(255,106,0,0.04)]">
          <div className="mb-3">
            <h3 className="text-sm font-extrabold">Mapa de calor</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Origem por estado (UF ou DDD)
            </p>
          </div>
          <BrazilHeatMap counts={ufCounts} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line px-3 py-3 text-center">
              <p className="text-2xl font-extrabold text-brand-grad">
                {uniqueCities(filtered)}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Cidades
              </p>
            </div>
            <div className="rounded-xl border border-line px-3 py-3 text-center">
              <p className="text-2xl font-extrabold text-brand-grad">
                {uniqueStates(filtered)}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                Estados
              </p>
            </div>
          </div>
        </aside>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-extrabold">Últimos carros</h2>
          <p className="text-sm text-muted font-medium">
            No período selecionado
          </p>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-3xl bg-white border border-dashed border-[#d4d4d8] p-10 text-center">
            <p className="text-lg font-bold">Nenhum lead neste período</p>
            <p className="text-muted mt-2 text-sm">
              Troque o filtro de data ou aguarde novos envios do quiz.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recent.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                captadorName={captadorName}
                showAssignee={showAssignee}
                onUpdated={onLeadUpdated}
                onBought={onBought}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
