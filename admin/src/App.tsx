import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  LayoutDashboard,
  List,
  BadgeCheck,
  RefreshCw,
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Megaphone,
  Users,
  Network,
  Car,
  ClipboardCheck,
  ShoppingCart,
  Warehouse,
  Store,
  BadgeDollarSign,
  Wallet,
  BarChart3,
  ScrollText,
  Settings2,
  HeartPulse,
  Table2,
  FileText,
  NotebookPen,
  ArrowLeftRight,
  ShoppingBag,
  CalendarDays,
  Wallet as WalletNav,
  MessageSquareText,
} from 'lucide-react'
import { mergeLeadLists, type LeadRecord } from '@shared/leads'
import { leadVisibleToCaptador } from '@shared/captadorCampaign'
import { evaluateStoredLead } from '@shared/leadQuality'
import {
  clearToken,
  fetchIntegrations,
  fetchLeads,
  fetchMe,
  getToken,
  login,
  setToken,
  type AuthUser,
  type IntegrationStatus,
} from './lib/api'
import {
  type Section,
  canAccessSection,
  defaultSectionForRole,
  normalizeRole,
  sectionsUnlockedByExtras,
  workspaceLabel,
} from './lib/roles'
import { acceptInvite } from './lib/adminApi'
import { LeadCard } from './components/LeadCard'
import { Dashboard } from './components/Dashboard'
import { Settings as AccountSettings } from './components/Settings'
import { ProfileMenu } from './components/ProfileMenu'
import { Marketing } from './components/Marketing'
import {
  AdminLeadsPanel,
  CompanyAdmin,
} from './components/CompanyAdmin'
import { FipePuxador } from './components/FipePuxador'
import { Contrato } from './components/Contrato'
import { LeadAnotacoes } from './components/LeadAnotacoes'
import { CompraVenda } from './components/CompraVenda'
import { Agenda, AgendaDashboardStrip } from './components/Agenda'
import { Pagamentos } from './components/Pagamentos'
import { Relatorio } from './components/Relatorio'
import { Prompts } from './components/Prompts'
import { LeadListExport } from './components/LeadListExport'

const LOGO = '/logo.png'

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'prompt', label: 'Prompt', icon: MessageSquareText },
  { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'equipes', label: 'Equipes e Cargos', icon: Network },
  { id: 'leads', label: 'Leads e Clientes', icon: List },
  { id: 'qualificados', label: 'Qualificados', icon: BadgeCheck },
  { id: 'anotacoes', label: 'Anotações', icon: NotebookPen },
  { id: 'compra', label: 'Compra', icon: ShoppingBag },
  { id: 'venda', label: 'Venda', icon: BadgeDollarSign },
  { id: 'cv', label: 'Compra e Venda', icon: ArrowLeftRight },
  { id: 'pagamentos', label: 'Pagamentos', icon: WalletNav },
  { id: 'relatorio', label: 'Relatório', icon: BarChart3 },
  { id: 'puxador', label: 'Puxador FIPE', icon: Table2 },
  { id: 'contrato', label: 'Contrato', icon: FileText },
  { id: 'veiculos', label: 'Veículos', icon: Car },
  { id: 'avaliacoes', label: 'Avaliações', icon: ClipboardCheck },
  { id: 'aquisicoes', label: 'Aquisições', icon: ShoppingCart },
  { id: 'estoque', label: 'Estoque', icon: Warehouse },
  { id: 'catalogo', label: 'Catálogo', icon: Store },
  { id: 'vendas', label: 'Vendas', icon: BadgeDollarSign },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
  { id: 'integracoes', label: 'Integrações', icon: Plug },
  { id: 'auditoria', label: 'Auditoria', icon: ScrollText },
  { id: 'configuracoes', label: 'Configurações', icon: Settings2 },
  { id: 'saude', label: 'Saúde do Sistema', icon: HeartPulse },
]

const COMPANY_SECTIONS: Section[] = [
  'dashboard',
  'usuarios',
  'equipes',
  'veiculos',
  'avaliacoes',
  'aquisicoes',
  'estoque',
  'catalogo',
  'vendas',
  'financeiro',
  'relatorios',
  'auditoria',
  'configuracoes',
  'saude',
]

/** Menu focado do captador: atendimento + ferramentas do dia a dia */
const CAPTADOR_NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] =
  [
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'prompt', label: 'Prompt', icon: MessageSquareText },
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads e Clientes', icon: List },
    { id: 'qualificados', label: 'Qualificados', icon: BadgeCheck },
    { id: 'anotacoes', label: 'Anotações', icon: NotebookPen },
    { id: 'compra', label: 'Compra', icon: ShoppingBag },
    { id: 'venda', label: 'Venda', icon: BadgeDollarSign },
    { id: 'cv', label: 'Compra e Venda', icon: ArrowLeftRight },
    { id: 'pagamentos', label: 'Pagamentos', icon: WalletNav },
    { id: 'relatorio', label: 'Relatório', icon: BarChart3 },
    { id: 'puxador', label: 'Puxador FIPE', icon: Table2 },
    { id: 'contrato', label: 'Contrato', icon: FileText },
  ]

function parseInviteToken() {
  const hash = window.location.hash || ''
  if (hash.includes('aceitar-convite')) {
    const q = hash.split('?')[1] || ''
    return new URLSearchParams(q).get('token') || ''
  }
  const params = new URLSearchParams(window.location.search)
  return params.get('invite') || ''
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [section, setSection] = useState<Section>('dashboard')
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false)
  const [inviteToken, setInviteToken] = useState(() => parseInviteToken())
  const [cvFocusDealId, setCvFocusDealId] = useState<string | undefined>()
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = user?.id ?? null

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sectionParam = params.get('section')
    if (
      sectionParam === 'agenda' ||
      sectionParam === 'prompt' ||
      sectionParam === 'marketing' ||
      sectionParam === 'puxador' ||
      sectionParam === 'contrato' ||
      sectionParam === 'anotacoes' ||
      sectionParam === 'compra' ||
      sectionParam === 'venda' ||
      sectionParam === 'cv' ||
      sectionParam === 'pagamentos' ||
      sectionParam === 'relatorio' ||
      sectionParam === 'dashboard' ||
      sectionParam === 'leads' ||
      sectionParam === 'veiculos' ||
      sectionParam === 'catalogo' ||
      sectionParam === 'estoque'
    ) {
      setSection(sectionParam)
    }
    // Retorno do OAuth Instagram: guarda flag se a tela de login ainda estiver na frente
    const ig = params.get('ig')
    if (ig === 'connected' || ig === 'error') {
      sessionStorage.setItem(
        'ig_oauth_return',
        JSON.stringify({
          ig,
          reason: params.get('reason') || '',
          at: Date.now(),
        }),
      )
      setSection('marketing')
    }
    const token = getToken()
    if (!token) {
      setAuthChecking(false)
      return
    }
    void fetchMe()
      .then((data) => setUser(data.user))
      .catch(() => {
        clearToken()
        setUser(null)
        setLeads([])
      })
      .finally(() => setAuthChecking(false))
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    const userId = user.id
    const isCaptador = normalizeRole(user.role) === 'captador'
    setLoading(true)
    setError('')
    try {
      const data = await fetchLeads()
      if (userIdRef.current !== userId) return
      setLeads((prev) => {
        if (isCaptador) {
          return mergeLeadLists(
            data,
            prev.filter(
              (l) =>
                l.origem === 'manual' &&
                (l.createdById === userId || l.assigneeId === userId),
            ),
          )
        }
        return mergeLeadLists(data, prev)
      })
    } catch (e) {
      if (userIdRef.current !== userId) return
      if (String(e).includes('unauthorized')) {
        setUser(null)
        setLeads([])
        return
      }
      setError('Não foi possível carregar os leads.')
    } finally {
      if (userIdRef.current === userId) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    setLeads([])
  }, [user?.id])

  const loadIntegrations = useCallback(async () => {
    if (!user) return
    try {
      const data = await fetchIntegrations()
      setIntegrations(data.integrations || [])
    } catch {
      setIntegrations([])
    } finally {
      setIntegrationsLoaded(true)
    }
  }, [user])

  const role = user ? normalizeRole(user.role) : null
  const permExtras = useMemo(
    () => user?.permissionExtras || [],
    [user?.permissionExtras],
  )

  useEffect(() => {
    if (!user || !role) return
    const needsLeads =
      section === 'leads' ||
      section === 'qualificados' ||
      section === 'anotacoes' ||
      section === 'prompt' ||
      (section === 'dashboard' &&
        !canAccessSection(role, 'usuarios', permExtras))
    if (!needsLeads) return
    void load()
    const id = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(id)
  }, [user, role, load, section, permExtras])

  useEffect(() => {
    if (user && section === 'integracoes') void loadIntegrations()
  }, [user, section, loadIntegrations])

  const handleLeadUpdated = useCallback((updated: LeadRecord) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
    )
  }, [])

  const handleLeadCreated = useCallback((created: LeadRecord) => {
    setLeads((prev) => mergeLeadLists([created], prev))
  }, [])

  const scopedLeads = useMemo(() => {
    if (role !== 'captador' || !user) return leads
    return leads.filter((l) => leadVisibleToCaptador(l, user))
  }, [leads, role, user])

  const visible = useMemo(() => {
    if (section === 'qualificados') {
      return scopedLeads.filter((l) => evaluateStoredLead(l).qualified)
    }
    return scopedLeads
  }, [section, scopedLeads])

  useEffect(() => {
    if (!role) return
    if (section === 'ajustes') return
    if (!canAccessSection(role, section, permExtras)) {
      setSection(defaultSectionForRole(role))
    }
  }, [role, section, permExtras])

  const allowedNav = useMemo(() => {
    if (!role) return [] as typeof NAV
    if (role === 'captador') {
      const seen = new Set<Section>()
      const out: typeof NAV = []
      for (const item of CAPTADOR_NAV) {
        if (canAccessSection(role, item.id, permExtras)) {
          out.push(item)
          seen.add(item.id)
        }
      }
      // Funções extras liberam abas além do menu base do captador
      for (const id of sectionsUnlockedByExtras(role, permExtras)) {
        if (seen.has(id)) continue
        const item = NAV.find((n) => n.id === id)
        if (item && canAccessSection(role, id, permExtras)) {
          out.push(item)
          seen.add(id)
        }
      }
      return out
    }
    return NAV.filter((item) =>
      canAccessSection(role, item.id, permExtras),
    )
  }, [role, permExtras])

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    )
  }

  if (inviteToken && !user) {
    return (
      <AcceptInviteScreen
        token={inviteToken}
        onSuccess={(u) => {
          setUser(u)
          setInviteToken('')
          window.location.hash = ''
          setSection(defaultSectionForRole(normalizeRole(u.role)))
        }}
        onCancel={() => {
          setInviteToken('')
          window.location.hash = ''
        }}
      />
    )
  }

  if (!user || !role) {
    return (
      <LoginScreen
        onSuccess={(u) => {
          setUser(u)
          setSection(defaultSectionForRole(normalizeRole(u.role)))
        }}
      />
    )
  }

  const sectionTitle =
    section === 'ajustes'
      ? 'Perfil e configurações'
      : allowedNav.find((n) => n.id === section)?.label || 'Painel'

  const logout = () => {
    clearToken()
    setUser(null)
    setLeads([])
  }

  const useLegacyDashboard =
    section === 'dashboard' &&
    !canAccessSection(role, 'usuarios', permExtras)

  return (
    <div className="min-h-screen flex">
      <aside className="w-[240px] shrink-0 bg-[#141414] border-r border-white/[0.06] flex flex-col min-h-screen sticky top-0 max-h-screen overflow-y-auto">
        <div className="px-5 py-7 border-b border-white/[0.06]">
          <img
            src={LOGO}
            alt="Alpha Recupera"
            className="h-11 w-auto object-contain"
          />
          <p className="mt-3 text-[11px] text-white/40 font-semibold tracking-wide uppercase">
            {workspaceLabel(role)}
          </p>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-0.5">
          {allowedNav.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:bg-white/[0.04] hover:text-white/90'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    active ? 'text-brand' : 'text-white/35'
                  }`}
                />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-line px-5 sm:px-8 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">
              {sectionTitle}
            </h1>
            <p className="text-muted text-sm font-medium truncate">
              {section === 'agenda' &&
                'Compromissos, reuniões e avisos do painel'}
              {section === 'prompt' &&
                'Mensagens prontas para copiar e mandar no WhatsApp'}
              {section === 'dashboard' && 'Operação da empresa em tempo real'}
              {section === 'usuarios' && 'Criar usuários, cargos e equipes'}
              {section === 'equipes' && 'Setores, líderes e membros'}
              {section === 'leads' && 'CRM de captura de veículos'}
              {section === 'qualificados' && 'Leads bons para aquisição'}
              {section === 'anotacoes' &&
                'Ficha editável do cliente + FIPE e anotações'}
              {section === 'compra' &&
                'Carros comprados — docs e liberação para venda'}
              {section === 'venda' &&
                'Carros liberados — feche a venda e anexe docs'}
              {section === 'cv' &&
                'Histórico: carros que compramos e vendemos'}
              {section === 'pagamentos' &&
                'Acúmulo de entradas e saídas de compra e venda'}
              {section === 'relatorio' && 'Relatórios e indicadores'}
              {section === 'veiculos' && 'Veículos vinculados aos leads'}
              {section === 'puxador' && 'Consulta rápida da tabela FIPE'}
              {section === 'contrato' &&
                'Modelo pronto com assinatura do escritório'}
              {section === 'avaliacoes' && 'Checklist e decisões técnicas'}
              {section === 'aquisicoes' && 'Propostas e compras'}
              {section === 'estoque' && 'Veículos comprados'}
              {section === 'catalogo' && 'Vitrine pública de carros disponíveis'}
              {section === 'vendas' && 'Fechamentos e margens'}
              {section === 'financeiro' && 'Visão gerencial de valores'}
              {section === 'marketing' &&
                'Conectar, postar, story, agendar e vários no dia'}
              {section === 'relatorios' && 'Indicadores e exportações'}
              {section === 'integracoes' && 'Status das conexões'}
              {section === 'auditoria' && 'Histórico imutável de ações'}
              {section === 'configuracoes' && 'Regras da empresa'}
              {section === 'saude' && 'API, storage e filas (resumo)'}
              {section === 'ajustes' && 'Dados da conta'}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {(section === 'leads' ||
              section === 'qualificados' ||
              section === 'anotacoes' ||
              section === 'prompt') && (
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-line font-semibold text-sm hover:bg-soft disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">
                  {loading ? 'Atualizando…' : 'Atualizar'}
                </span>
              </button>
            )}
            {section === 'integracoes' && (
              <button
                type="button"
                onClick={() => void loadIntegrations()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-line font-semibold text-sm hover:bg-soft"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Verificar</span>
              </button>
            )}
            <ProfileMenu
              user={user}
              onOpenProfile={() => setSection('ajustes')}
              onLogout={logout}
            />
          </div>
        </header>

        <main className="flex-1 min-w-0 p-5 sm:p-8">
          {section === 'ajustes' ? (
            <AccountSettings user={user} onUserUpdated={setUser} />
          ) : section === 'agenda' ? (
            <Agenda />
          ) : section === 'prompt' ? (
            <Prompts leads={scopedLeads} />
          ) : section === 'marketing' ? (
            <Marketing user={user} />
          ) : section === 'puxador' ? (
            <FipePuxador />
          ) : section === 'anotacoes' ? (
            <LeadAnotacoes
              leads={scopedLeads}
              captadorName={user?.name}
              captadorId={user?.id}
              captadorSlug={user?.slug}
              onLeadUpdated={handleLeadUpdated}
              onLeadCreated={handleLeadCreated}
            />
          ) : section === 'compra' ||
            section === 'venda' ||
            section === 'cv' ? (
            <CompraVenda
              view={
                section === 'compra'
                  ? 'compra'
                  : section === 'venda'
                    ? 'venda'
                    : 'cv'
              }
              focusDealId={cvFocusDealId}
            />
          ) : section === 'pagamentos' ? (
            <Pagamentos />
          ) : section === 'relatorio' ? (
            <Relatorio />
          ) : section === 'contrato' ? (
            <Contrato />
          ) : section === 'integracoes' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-3xl">
              {!integrationsLoaded ? (
                <p className="text-muted font-medium">Verificando…</p>
              ) : (
                integrations.map((item) => (
                  <IntegrationCard
                    key={item.id}
                    title={item.name}
                    ok={item.ok}
                    status={item.status}
                    detail={item.detail}
                  />
                ))
              )}
            </div>
          ) : section === 'leads' &&
            canAccessSection(role, 'usuarios', permExtras) ? (
            <div className="space-y-4">
              <LeadListExport leads={leads} />
              <AdminLeadsPanel />
            </div>
          ) : COMPANY_SECTIONS.includes(section) && !useLegacyDashboard ? (
            <div className="space-y-5">
              {section === 'dashboard' ? (
                <AgendaDashboardStrip onOpen={() => setSection('agenda')} />
              ) : null}
              <CompanyAdmin
                section={section}
                user={user}
                onOpenMarketing={() => setSection('marketing')}
              />
            </div>
          ) : section === 'dashboard' && useLegacyDashboard ? (
            <>
              {error && (
                <div className="mb-6 rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
                  {error}
                </div>
              )}
              <div className="mb-5">
                <AgendaDashboardStrip onOpen={() => setSection('agenda')} />
              </div>
              <Dashboard
                leads={scopedLeads}
                loading={loading}
                captadorName={user?.name}
                campaignSlug={user?.slug || user?.name}
                onLeadUpdated={handleLeadUpdated}
                onBought={() => {
                  try {
                    const id = sessionStorage.getItem('cv_focus_deal') || ''
                    if (id) setCvFocusDealId(id)
                  } catch {
                    /* ignore */
                  }
                  setSection('compra')
                }}
              />
            </>
          ) : (
            <>
              {error && (
                <div className="mb-6 rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
                  {error}
                </div>
              )}

              {section === 'leads' ? (
                <div className="mb-5">
                  <LeadListExport leads={scopedLeads} />
                </div>
              ) : null}

              {loading && leads.length === 0 ? (
                <p className="text-muted font-medium">Carregando leads…</p>
              ) : visible.length === 0 ? (
                <div className="rounded-3xl bg-white border border-dashed border-[#d4d4d8] p-12 text-center">
                  <p className="text-lg font-bold">Nenhum carro por aqui ainda</p>
                  <p className="text-muted mt-2 text-sm">
                    Quando alguém abrir o quiz e enviar, aparece neste painel.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {visible.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      captadorName={user?.name}
                      showAssignee={role !== 'captador'}
                      onUpdated={handleLeadUpdated}
                      onBought={() => {
                        try {
                          const id = sessionStorage.getItem('cv_focus_deal') || ''
                          if (id) setCvFocusDealId(id)
                        } catch {
                          /* ignore */
                        }
                        setSection('compra')
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function AcceptInviteScreen({
  token,
  onSuccess,
  onCancel,
}: {
  token: string
  onSuccess: (user: AuthUser) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await acceptInvite({ token, password, name })
      setToken(data.token)
      onSuccess(data.user as AuthUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aceitar convite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-3xl bg-white border border-line p-8 shadow-[0_20px_50px_rgba(255,106,0,0.1)]"
      >
        <img src={LOGO} alt="Alpha Recupera" className="h-14 w-auto mb-6" />
        <h1 className="text-2xl font-extrabold tracking-tight">
          Aceitar convite
        </h1>
        <p className="text-muted text-sm mt-1 mb-6">
          Defina sua senha para ativar o acesso (mín. 8 caracteres)
        </p>
        <label className="block text-sm font-semibold mb-1.5">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-4 rounded-xl border-2 border-line px-4 py-3 outline-none focus:border-brand"
        />
        <label className="block text-sm font-semibold mb-1.5">Senha</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 rounded-xl border-2 border-line px-4 py-3 outline-none focus:border-brand"
        />
        {error && <p className="mb-4 text-sm font-semibold text-bad">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="btn-brand w-full rounded-xl py-3.5 font-bold disabled:opacity-70 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Ativar conta
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-3 text-sm font-semibold text-muted"
        >
          Voltar ao login
        </button>
      </form>
    </div>
  )
}

function LoginScreen({
  onSuccess,
}: {
  onSuccess: (user: AuthUser) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await login(email, password)
      onSuccess(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-md rounded-3xl bg-white border border-line p-8 shadow-[0_20px_50px_rgba(255,106,0,0.1)]"
      >
        <img src={LOGO} alt="Alpha Recupera" className="h-14 w-auto mb-6" />
        <h1 className="text-2xl font-extrabold tracking-tight">
          Entrar no painel
        </h1>
        <p className="text-muted text-sm mt-1 mb-6">
          Acesso seguro com e-mail e senha
        </p>

        <label className="block text-sm font-semibold mb-1.5">E-mail</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-xl border-2 border-line px-4 py-3 outline-none focus:border-brand"
          autoComplete="username"
        />

        <label className="block text-sm font-semibold mb-1.5">Senha</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 rounded-xl border-2 border-line px-4 py-3 outline-none focus:border-brand"
          autoComplete="current-password"
        />

        {error && (
          <p className="mb-4 text-sm font-semibold text-bad">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-brand w-full rounded-xl py-3.5 font-bold disabled:opacity-70 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Entrar
        </button>
      </form>
    </div>
  )
}

function IntegrationCard({
  title,
  ok,
  status,
  detail,
}: {
  title: string
  ok: boolean
  status?: string
  detail?: string
}) {
  const Icon = ok ? CheckCircle2 : status === 'parcial' ? AlertTriangle : XCircle
  const tone = ok
    ? 'text-ok bg-green-50 border-green-100'
    : status === 'parcial'
      ? 'text-amber-600 bg-amber-50 border-amber-100'
      : 'text-bad bg-red-50 border-red-100'

  return (
    <article className="rounded-2xl bg-white border border-line p-6 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase ${tone}`}
        >
          <Icon className="w-3.5 h-3.5" />
          {ok ? 'OK' : status === 'parcial' ? 'Parcial' : 'Erro'}
        </span>
      </div>
      {detail && <p className="text-sm text-[#374151] font-medium">{detail}</p>}
    </article>
  )
}
