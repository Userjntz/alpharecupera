import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  Search,
  RefreshCw,
} from 'lucide-react'
import type { Permission, Section, UserRole } from '../lib/roles'
import {
  ROLE_LABELS,
  hasPermission,
  normalizeRole,
  LEAD_PIPELINE_STAGES,
} from '../lib/roles'
import type { AuthUser } from '../lib/api'
import {
  createTeam,
  fetchAcquisitions,
  fetchActionCenter,
  fetchAdminDashboard,
  fetchAdminLeads,
  fetchAudit,
  fetchEvaluations,
  fetchFinanceSummary,
  fetchInventory,
  fetchOrgSettings,
  fetchReportsOverview,
  fetchSales,
  fetchSystemHealth,
  fetchTeams,
  fetchVehicles,
  globalSearch,
  patchAdminLead,
  patchAcquisition,
  patchOrgSettings,
  patchTeam,
  createExport,
  createEvaluation,
  createAcquisition,
  fetchMarketingSummary,
} from '../lib/adminApi'
import { UsersAdmin } from './UsersAdmin'
import { CatalogAdmin } from './CatalogAdmin'

function money(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-white border border-dashed border-[#d4d4d8] p-10 text-center">
      <p className="text-lg font-bold">{title}</p>
      {hint && <p className="text-muted mt-2 text-sm">{hint}</p>}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white border border-line p-4">
      <p className="text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="text-xs text-muted font-semibold mt-1">{label}</p>
    </div>
  )
}

function Toolbar({
  q,
  setQ,
  onRefresh,
  children,
}: {
  q: string
  setQ: (v: string) => void
  onRefresh: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[180px] max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          className="w-full rounded-xl border-2 border-line pl-9 pr-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>
      {children}
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-line text-sm font-semibold hover:bg-soft"
      >
        <RefreshCw className="w-4 h-4" />
        Atualizar
      </button>
    </div>
  )
}

export function CompanyAdmin({
  section,
  user,
  onOpenMarketing,
}: {
  section: Section
  user: AuthUser
  onOpenMarketing: () => void
}) {
  const role = normalizeRole(user.role)
  const extras = user.permissionExtras || []

  if (section === 'dashboard') {
    return <AdminDashboard role={role} extras={extras} />
  }
  if (section === 'usuarios') {
    return (
      <UsersAdmin
        role={role}
        extras={extras}
        currentUserId={user.id}
      />
    )
  }
  if (section === 'equipes') {
    return <TeamsAdmin role={role} extras={extras} />
  }
  if (section === 'veiculos') {
    return <VehiclesAdmin />
  }
  if (section === 'avaliacoes') {
    return <EvaluationsAdmin role={role} extras={extras} />
  }
  if (section === 'aquisicoes') {
    return <AcquisitionsAdmin role={role} extras={extras} />
  }
  if (section === 'estoque') {
    return <InventoryAdmin />
  }
  if (section === 'catalogo') {
    return <CatalogAdmin />
  }
  if (section === 'vendas') {
    return <SalesAdmin />
  }
  if (section === 'financeiro') {
    return <FinanceAdmin />
  }
  if (section === 'relatorios') {
    return <ReportsAdmin role={role} extras={extras} />
  }
  if (section === 'auditoria') {
    return <AuditAdmin />
  }
  if (section === 'configuracoes') {
    return <OrgSettingsAdmin role={role} />
  }
  if (section === 'saude') {
    return <HealthAdmin />
  }
  if (section === 'marketing') {
    return <MarketingBridge onOpen={onOpenMarketing} />
  }

  return (
    <Empty
      title="Módulo indisponível"
      hint="Esta seção não está disponível para o seu perfil."
    />
  )
}

function AdminDashboard({
  role,
  extras = [],
}: {
  role: UserRole
  extras?: Permission[]
}) {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchAdminDashboard>
  > | null>(null)
  const [actions, setActions] = useState<
    { type: string; id: string; title: string; href: string }[]
  >([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<
    { type: string; id: string; title: string; subtitle: string }[]
  >([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [dash, act] = await Promise.all([
        fetchAdminDashboard(period),
        fetchActionCenter(),
      ])
      setData(dash)
      setActions(act.actions || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (searchQ.trim().length < 2) {
      setSearchResults([])
      return
    }
    const t = window.setTimeout(() => {
      void globalSearch(searchQ)
        .then((r) => setSearchResults(r.results || []))
        .catch(() => setSearchResults([]))
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchQ])

  const k = data?.kpis || {}

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {['hoje', '7d', '30d', 'mes', 'tudo'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase ${
                period === p
                  ? 'bg-brand text-white'
                  : 'bg-white border border-line text-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted font-medium">
          Atualizado: {fmtDate(data?.updatedAt)}
        </p>
      </div>

      <div className="relative max-w-lg">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Busca global (usuários, leads, veículos)…"
          className="w-full rounded-xl border-2 border-line pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full rounded-xl border border-line bg-white shadow-lg max-h-64 overflow-auto">
            {searchResults.map((r) => (
              <li
                key={`${r.type}-${r.id}`}
                className="px-3 py-2 border-b border-line last:border-0"
              >
                <p className="text-sm font-bold">{r.title}</p>
                <p className="text-xs text-muted">
                  {r.type} · {r.subtitle}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}
      {loading && !data ? (
        <p className="text-muted font-medium">Carregando indicadores…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
            <Kpi label="Novos leads" value={k.newLeads ?? 0} />
            <Kpi label="Aguardando atendimento" value={k.waitingService ?? 0} />
            <Kpi label="Sem responsável" value={k.unassigned ?? 0} />
            <Kpi label="Qualificados" value={k.qualified ?? 0} />
            <Kpi
              label="1º atendimento (min)"
              value={k.avgFirstTouchMinutes ?? '—'}
            />
            <Kpi label="Avaliações pendentes" value={k.evaluationsPending ?? 0} />
            <Kpi label="Propostas enviadas" value={k.proposalsSent ?? 0} />
            <Kpi label="Em estoque" value={k.inStock ?? 0} />
            <Kpi label="Vendidos" value={k.sold ?? 0} />
            <Kpi label="Usuários ativos" value={k.activeUsers ?? 0} />
          </div>

          {data?.finance && hasPermission(role, 'finance.view_summary', extras) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                label="Custo aquisição"
                value={money(data.finance.acquisitionCost)}
              />
              <Kpi label="Custos extras" value={money(data.finance.extraCosts)} />
              <Kpi label="Vendas" value={money(data.finance.salesValue)} />
              <Kpi
                label="Margem bruta"
                value={money(data.finance.grossMargin)}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl bg-white border border-line p-5">
              <h3 className="font-extrabold mb-3">Funil</h3>
              <ul className="space-y-2">
                {(data?.charts.funnel || []).map((f) => (
                  <li
                    key={f.stage}
                    className="flex justify-between text-sm font-semibold"
                  >
                    <span>{f.stage}</span>
                    <span className="text-brand">{f.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl bg-white border border-line p-5">
              <h3 className="font-extrabold mb-3">Central de pendências</h3>
              {actions.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma pendência no momento.</p>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => (
                    <li
                      key={`${a.type}-${a.id}`}
                      className="text-sm font-medium border border-line rounded-xl px-3 py-2"
                    >
                      {a.title}
                    </li>
                  ))}
                </ul>
              )}
              {(data?.alerts || []).length > 0 && (
                <ul className="mt-4 space-y-1">
                  {data!.alerts.map((a, i) => (
                    <li key={i} className="text-xs font-semibold text-amber-700">
                      {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function TeamsAdmin({
  role,
  extras = [],
}: {
  role: UserRole
  extras?: Permission[]
}) {
  const [teams, setTeams] = useState<
    Awaited<ReturnType<typeof fetchTeams>>['teams']
  >([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTeams((await fetchTeams()).teams || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      {hasPermission(role, 'teams.manage', extras) && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void createTeam(name.trim())
              .then(() => {
                setName('')
                return load()
              })
              .catch((err) =>
                setError(err instanceof Error ? err.message : 'Falha'),
              )
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Nova equipe"
            className="flex-1 rounded-xl border-2 border-line px-3 py-2"
          />
          <button type="submit" className="btn-brand rounded-xl px-4 py-2 text-sm font-bold">
            Criar
          </button>
        </form>
      )}
      {error && <p className="text-bad text-sm font-semibold">{error}</p>}
      {loading ? (
        <p className="text-muted">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {teams.map((t) => (
            <article
              key={t.id}
              className="rounded-2xl bg-white border border-line p-4"
            >
              <div className="flex justify-between gap-2">
                <h3 className="font-extrabold">{t.name}</h3>
                {hasPermission(role, 'teams.manage', extras) && !t.archived && (
                  <button
                    type="button"
                    className="text-xs font-bold text-muted"
                    onClick={() =>
                      void patchTeam(t.id, { archived: true }).then(load)
                    }
                  >
                    Arquivar
                  </button>
                )}
              </div>
              <p className="text-xs text-muted mt-1">
                {t.memberCount} membro(s)
                {t.archived ? ' · arquivada' : ''}
              </p>
              <ul className="mt-3 space-y-1">
                {(t.members || []).slice(0, 5).map((m) => (
                  <li key={m.id} className="text-sm">
                    {m.name}{' '}
                    <span className="text-xs text-muted">
                      ({ROLE_LABELS[normalizeRole(m.role)] || m.role})
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function VehiclesAdmin() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchVehicles({ q, page: '1', pageSize: '50' })
      setItems(res.items || [])
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <Toolbar q={q} setQ={setQ} onRefresh={() => void load()} />
      {loading ? (
        <p className="text-muted">Carregando veículos…</p>
      ) : items.length === 0 ? (
        <Empty
          title="Nenhum veículo"
          hint="Veículos vêm dos leads do quiz e do cadastro operacional."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((v) => (
            <article
              key={String(v.id)}
              className="rounded-2xl bg-white border border-line p-4"
            >
              <p className="font-extrabold">
                {String(v.marca)} {String(v.modelo)}
              </p>
              <p className="text-sm text-muted">
                {String(v.ano)} · {String(v.quilometragem || '—')} km
              </p>
              <p className="text-xs font-bold uppercase text-brand mt-2">
                {String(v.pipeline || 'NOVO')}
              </p>
              <p className="text-xs text-muted mt-1">
                Cliente: {String(v.ownerName || '—')}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function EvaluationsAdmin({
  role,
  extras = [],
}: {
  role: UserRole
  extras?: Permission[]
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [leadId, setLeadId] = useState('')
  const [notes, setNotes] = useState('')
  const [estimatedValue, setEstimatedValue] = useState('')

  const load = useCallback(async () => {
    setItems((await fetchEvaluations({ pageSize: '50' })).items || [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      {hasPermission(role, 'vehicles.evaluate', extras) && (
        <form
          className="rounded-2xl bg-white border border-line p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void createEvaluation({
              leadId: leadId || null,
              notes,
              estimatedValue: Number(estimatedValue || 0),
              status: 'PENDENTE',
            }).then(() => {
              setLeadId('')
              setNotes('')
              setEstimatedValue('')
              return load()
            })
          }}
        >
          <input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="ID do lead"
            className="rounded-xl border-2 border-line px-3 py-2"
          />
          <input
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            placeholder="Valor estimado"
            className="rounded-xl border-2 border-line px-3 py-2"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações"
            className="rounded-xl border-2 border-line px-3 py-2"
          />
          <button
            type="submit"
            className="btn-brand rounded-xl px-4 py-2 text-sm font-bold sm:col-span-3 w-fit"
          >
            Registrar avaliação
          </button>
        </form>
      )}
      {items.length === 0 ? (
        <Empty title="Nenhuma avaliação registrada" />
      ) : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li
              key={String(e.id)}
              className="rounded-xl border border-line bg-white px-4 py-3 text-sm"
            >
              <p className="font-bold">
                {String(e.status)} · {money(Number(e.estimatedValue || 0))}
              </p>
              <p className="text-muted text-xs mt-1">{String(e.notes || '')}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AcquisitionsAdmin({
  role,
  extras = [],
}: {
  role: UserRole
  extras?: Permission[]
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [leadId, setLeadId] = useState('')
  const [value, setValue] = useState('')

  const load = useCallback(async () => {
    setItems((await fetchAcquisitions({ pageSize: '50' })).items || [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      {hasPermission(role, 'acquisitions.propose', extras) && (
        <form
          className="rounded-2xl bg-white border border-line p-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void createAcquisition({
              leadId: leadId || null,
              purchaseValue: Number(value || 0),
              stage: 'PROPOSTA_ENVIADA',
            }).then(() => {
              setLeadId('')
              setValue('')
              return load()
            })
          }}
        >
          <input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Lead ID"
            className="rounded-xl border-2 border-line px-3 py-2"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Valor proposta"
            className="rounded-xl border-2 border-line px-3 py-2"
          />
          <button type="submit" className="btn-brand rounded-xl px-4 py-2 text-sm font-bold">
            Criar proposta
          </button>
        </form>
      )}
      {items.length === 0 ? (
        <Empty title="Nenhuma aquisição" hint="Crie propostas a partir de leads qualificados." />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={String(a.id)}
              className="rounded-xl border border-line bg-white px-4 py-3 flex flex-wrap justify-between gap-2"
            >
              <div>
                <p className="font-bold text-sm">{String(a.stage)}</p>
                <p className="text-xs text-muted">
                  {money(
                    a.purchaseValue == null
                      ? null
                      : Number(a.purchaseValue),
                  )}
                </p>
              </div>
              {hasPermission(role, 'acquisitions.approve', extras) &&
                a.stage === 'PROPOSTA_ENVIADA' && (
                  <button
                    type="button"
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border border-line hover:bg-soft"
                    onClick={() =>
                      void patchAcquisition(String(a.id), {
                        stage: 'APROVADO',
                      }).then(load)
                    }
                  >
                    Aprovar
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function InventoryAdmin() {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    void fetchInventory({ pageSize: '50' }).then((r) => setItems(r.items || []))
  }, [])
  if (!items.length) {
    return (
      <Empty
        title="Estoque vazio"
        hint="Veículos entram no estoque ao concluir aquisição (COMPRADO)."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li
          key={String(i.id)}
          className="rounded-xl border border-line bg-white px-4 py-3 text-sm"
        >
          <p className="font-bold">{String(i.status)}</p>
          <p className="text-xs text-muted">
            {Number(i.daysInStock ?? 0)} dias · custo{' '}
            {money(
              i.acquisitionCost == null
                ? null
                : Number(i.acquisitionCost),
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

function SalesAdmin() {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    void fetchSales({ pageSize: '50' }).then((r) => setItems(r.items || []))
  }, [])
  if (!items.length) {
    return (
      <Empty
        title="Nenhuma venda registrada"
        hint="Módulo pronto; registre vendas conforme a operação avançar."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li
          key={String(s.id)}
          className="rounded-xl border border-line bg-white px-4 py-3 text-sm font-bold"
        >
          {String(s.status)} · {money(Number(s.saleValue || 0))}
        </li>
      ))}
    </ul>
  )
}

function FinanceAdmin() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchFinanceSummary>
  > | null>(null)
  useEffect(() => {
    void fetchFinanceSummary().then(setData)
  }, [])
  if (!data) return <p className="text-muted">Carregando…</p>
  const s = data.summary
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{data.moduleNote}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Compras" value={money(s.purchaseTotal as number | null)} />
        <Kpi label="Extras" value={money(s.extraCosts as number | null)} />
        <Kpi label="Vendas" value={money(s.salesTotal as number | null)} />
        <Kpi label="Margem" value={money(s.grossMargin as number | null)} />
        <Kpi label="Comprados" value={Number(s.boughtCount || 0)} />
        <Kpi label="Vendidos" value={Number(s.soldCount || 0)} />
      </div>
    </div>
  )
}

function ReportsAdmin({
  role,
  extras = [],
}: {
  role: UserRole
  extras?: Permission[]
}) {
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [exportMsg, setExportMsg] = useState('')
  useEffect(() => {
    void fetchReportsOverview().then((r) => setReport(r.report))
  }, [])

  return (
    <div className="space-y-4">
      {!report ? (
        <p className="text-muted">Carregando…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(report).map(([k, v]) =>
            typeof v === 'object' ? null : (
              <Kpi key={k} label={k} value={String(v)} />
            ),
          )}
        </div>
      )}
      {hasPermission(role, 'reports.export', extras) ||
      hasPermission(role, 'leads.export', extras) ? (
        <button
          type="button"
          className="btn-brand rounded-xl px-4 py-2 text-sm font-bold"
          onClick={() =>
            void createExport('leads').then((r) =>
              setExportMsg(
                `Exportação pronta: ${r.export.rowCount} linhas. Baixe em ${r.export.downloadPath} (expira ${fmtDate(r.export.expires_at)})`,
              ),
            )
          }
        >
          Exportar leads (CSV)
        </button>
      ) : null}
      {exportMsg && <p className="text-sm font-medium">{exportMsg}</p>}
    </div>
  )
}

function AuditAdmin() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const load = useCallback(async () => {
    setItems((await fetchAudit({ q, pageSize: '50' })).items || [])
  }, [q])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <div>
      <Toolbar q={q} setQ={setQ} onRefresh={() => void load()} />
      {items.length === 0 ? (
        <Empty title="Nenhum evento de auditoria" />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={String(a.id)}
              className="rounded-xl border border-line bg-white px-4 py-3 text-sm"
            >
              <p className="font-bold">{String(a.action)}</p>
              <p className="text-xs text-muted">
                {String(a.actorEmail || 'sistema')} · {fmtDate(String(a.at))} ·{' '}
                {String(a.resource)}/{String(a.resourceId || '—')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OrgSettingsAdmin({ role }: { role: UserRole }) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    void fetchOrgSettings().then((r) => setSettings(r.settings))
  }, [])
  if (!settings) return <p className="text-muted">Carregando…</p>
  const canEdit = hasPermission(role, 'settings.manage')
  return (
    <form
      className="max-w-xl space-y-3 rounded-2xl bg-white border border-line p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canEdit) return
        void patchOrgSettings({
          name: settings.name,
          timezone: settings.timezone,
          leadSlaMinutes: Number(settings.leadSlaMinutes || 60),
        }).then((r) => {
          setSettings(r.settings)
          setMsg('Configurações salvas.')
        })
      }}
    >
      <div>
        <label className="block text-sm font-semibold mb-1">Nome da empresa</label>
        <input
          disabled={!canEdit}
          value={String(settings.name || '')}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          className="w-full rounded-xl border-2 border-line px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">Timezone</label>
        <input
          disabled={!canEdit}
          value={String(settings.timezone || 'America/Sao_Paulo')}
          onChange={(e) =>
            setSettings({ ...settings, timezone: e.target.value })
          }
          className="w-full rounded-xl border-2 border-line px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold mb-1">
          SLA atendimento (minutos)
        </label>
        <input
          type="number"
          disabled={!canEdit}
          value={Number(settings.leadSlaMinutes || 60)}
          onChange={(e) =>
            setSettings({ ...settings, leadSlaMinutes: e.target.value })
          }
          className="w-full rounded-xl border-2 border-line px-3 py-2"
        />
      </div>
      {canEdit && (
        <button type="submit" className="btn-brand rounded-xl px-4 py-2 text-sm font-bold">
          Salvar
        </button>
      )}
      {msg && <p className="text-ok text-sm font-semibold">{msg}</p>}
    </form>
  )
}

function HealthAdmin() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    void fetchSystemHealth().then((r) => setHealth(r.health))
  }, [])
  if (!health) return <p className="text-muted">Verificando…</p>
  return (
    <div className="rounded-2xl bg-white border border-line p-5 space-y-2 text-sm">
      {Object.entries(health).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line py-2">
          <span className="font-semibold">{k}</span>
          <span className="text-muted text-right">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
      <p className="text-xs text-muted pt-2">
        Segredos, tokens e connection strings não são exibidos.
      </p>
    </div>
  )
}

function MarketingBridge({ onOpen }: { onOpen: () => void }) {
  const [note, setNote] = useState('')
  useEffect(() => {
    void fetchMarketingSummary().then((r) =>
      setNote(String(r.summary?.note || '')),
    )
  }, [])
  return (
    <div className="rounded-2xl bg-white border border-line p-8 text-center space-y-4 max-w-lg">
      <p className="font-extrabold text-lg">Painel de Marketing</p>
      <p className="text-sm text-muted">
        {note ||
          'Integração Instagram, agendamentos e métricas ficam no módulo completo.'}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="btn-brand rounded-xl px-5 py-2.5 text-sm font-bold"
      >
        Abrir Marketing
      </button>
    </div>
  )
}

/** Lista admin de leads com pipeline */
export function AdminLeadsPanel() {
  const [q, setQ] = useState('')
  const [pipeline, setPipeline] = useState('')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { pageSize: '40' }
      if (q) params.q = q
      if (pipeline) params.pipeline = pipeline
      setItems((await fetchAdminLeads(params)).items || [])
    } finally {
      setLoading(false)
    }
  }, [q, pipeline])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <Toolbar q={q} setQ={setQ} onRefresh={() => void load()}>
        <select
          value={pipeline}
          onChange={(e) => setPipeline(e.target.value)}
          className="rounded-xl border-2 border-line px-3 py-2 text-sm"
        >
          <option value="">Todas as etapas</option>
          {LEAD_PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Toolbar>
      {loading ? (
        <p className="text-muted">Carregando…</p>
      ) : items.length === 0 ? (
        <Empty title="Nenhum lead" />
      ) : (
        <div className="space-y-2">
          {items.map((l) => (
            <div
              key={String(l.id)}
              className="rounded-xl border border-line bg-white px-4 py-3 flex flex-wrap justify-between gap-2"
            >
              <div>
                <p className="font-bold text-sm">{String(l.nome)}</p>
                <p className="text-xs text-muted">
                  {String(l.telefone)} · {String(l.marca)} {String(l.modelo)}
                </p>
              </div>
              <select
                value={String(l.pipeline || 'NOVO')}
                onChange={(e) =>
                  void patchAdminLead(String(l.id), {
                    pipeline: e.target.value,
                    lossReason:
                      e.target.value === 'PERDIDO' || e.target.value === 'RECUSADO'
                        ? 'Atualizado pelo admin'
                        : undefined,
                  }).then(load)
                }
                className="rounded-lg border border-line text-xs font-bold px-2 py-1"
              >
                {[...LEAD_PIPELINE_STAGES, 'PERDIDO', 'RECUSADO', 'PAUSADO'].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
