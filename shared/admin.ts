/**
 * RBAC e tipos do Painel Administrativo da empresa (Alpha Recupera).
 * Permissões granulares — autorização no backend; o frontend só esconde UI.
 */

export type UserRole =
  | 'admin'
  | 'gerente'
  | 'captador'
  | 'avaliador'
  | 'vendedor'
  | 'marketing'
  | 'financeiro'
  | 'auditor'

export type AccountStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'

export type Permission =
  | 'admin.dashboard.view'
  | 'users.view'
  | 'users.invite'
  | 'users.edit'
  | 'users.suspend'
  | 'users.sessions.revoke'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.assign'
  | 'teams.view'
  | 'teams.manage'
  | 'leads.view'
  | 'leads.create'
  | 'leads.edit'
  | 'leads.assign'
  | 'leads.export'
  | 'vehicles.view'
  | 'vehicles.create'
  | 'vehicles.edit'
  | 'vehicles.evaluate'
  | 'vehicles.documents.view'
  | 'acquisitions.view'
  | 'acquisitions.propose'
  | 'acquisitions.approve'
  | 'acquisitions.complete'
  | 'inventory.view'
  | 'inventory.manage'
  | 'sales.view'
  | 'sales.create'
  | 'sales.approve'
  | 'sales.complete'
  | 'finance.view_summary'
  | 'finance.view_details'
  | 'finance.edit'
  | 'finance.approve'
  | 'finance.export'
  | 'marketing.view'
  | 'marketing.create'
  | 'marketing.schedule'
  | 'marketing.publish'
  | 'marketing.manage'
  | 'reports.view'
  | 'reports.export'
  | 'audit.view'
  | 'integrations.view'
  | 'integrations.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'settings.security'
  | 'system.health.view'
  | 'notifications.view'

export type AdminSection =
  | 'agenda'
  | 'dashboard'
  | 'usuarios'
  | 'equipes'
  | 'leads'
  | 'qualificados'
  | 'veiculos'
  | 'puxador'
  | 'contrato'
  | 'prompt'
  | 'anotacoes'
  | 'compra'
  | 'venda'
  | 'cv'
  | 'pagamentos'
  | 'relatorio'
  | 'avaliacoes'
  | 'aquisicoes'
  | 'estoque'
  | 'catalogo'
  | 'vendas'
  | 'financeiro'
  | 'marketing'
  | 'relatorios'
  | 'integracoes'
  | 'auditoria'
  | 'configuracoes'
  | 'saude'
  | 'ajustes'

export const ALL_ROLES: UserRole[] = [
  'admin',
  'gerente',
  'captador',
  'avaliador',
  'vendedor',
  'marketing',
  'financeiro',
  'auditor',
]

export const ALL_PERMISSIONS: Permission[] = [
  'admin.dashboard.view',
  'users.view',
  'users.invite',
  'users.edit',
  'users.suspend',
  'users.sessions.revoke',
  'roles.view',
  'roles.create',
  'roles.edit',
  'roles.assign',
  'teams.view',
  'teams.manage',
  'leads.view',
  'leads.create',
  'leads.edit',
  'leads.assign',
  'leads.export',
  'vehicles.view',
  'vehicles.create',
  'vehicles.edit',
  'vehicles.evaluate',
  'vehicles.documents.view',
  'acquisitions.view',
  'acquisitions.propose',
  'acquisitions.approve',
  'acquisitions.complete',
  'inventory.view',
  'inventory.manage',
  'sales.view',
  'sales.create',
  'sales.approve',
  'sales.complete',
  'finance.view_summary',
  'finance.view_details',
  'finance.edit',
  'finance.approve',
  'finance.export',
  'marketing.view',
  'marketing.create',
  'marketing.schedule',
  'marketing.publish',
  'marketing.manage',
  'reports.view',
  'reports.export',
  'audit.view',
  'integrations.view',
  'integrations.manage',
  'settings.view',
  'settings.manage',
  'settings.security',
  'system.health.view',
  'notifications.view',
]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Proprietário',
  gerente: 'Administrador',
  captador: 'Captador / Atendimento',
  avaliador: 'Avaliador',
  vendedor: 'Vendedor',
  marketing: 'Marketing',
  financeiro: 'Financeiro',
  auditor: 'Auditor',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin:
    'Maior nível na empresa: usuários, segurança, configurações e visão total',
  gerente: 'Opera a empresa: equipes, leads, relatórios e marketing',
  captador: 'Recebe e qualifica leads de veículos para aquisição',
  avaliador: 'Registra avaliações técnicas e recomendações',
  vendedor: 'Atende veículos liberados e registra propostas de venda',
  marketing:
    'Somente Marketing e Instagram — sem operação de veículos',
  financeiro: 'Valores, margens e confirmações financeiras',
  auditor: 'Somente leitura nos módulos autorizados',
}

/** Rank: maior = mais privilegiado. Impede autoelevação. */
export const ROLE_RANK: Record<UserRole, number> = {
  admin: 100,
  gerente: 80,
  financeiro: 50,
  captador: 40,
  avaliador: 40,
  vendedor: 40,
  marketing: 40,
  auditor: 10,
}

const OPS_LEADS: Permission[] = [
  'admin.dashboard.view',
  'leads.view',
  'leads.create',
  'leads.edit',
  'leads.assign',
  'vehicles.view',
  'vehicles.edit',
  'acquisitions.view',
  'acquisitions.propose',
  'notifications.view',
]

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  gerente: [
    'admin.dashboard.view',
    'users.view',
    'users.invite',
    'users.edit',
    'users.suspend',
    'users.sessions.revoke',
    'roles.view',
    'roles.assign',
    'teams.view',
    'teams.manage',
    'leads.view',
    'leads.create',
    'leads.edit',
    'leads.assign',
    'leads.export',
    'vehicles.view',
    'vehicles.create',
    'vehicles.edit',
    'vehicles.evaluate',
    'vehicles.documents.view',
    'acquisitions.view',
    'acquisitions.propose',
    'acquisitions.approve',
    'acquisitions.complete',
    'inventory.view',
    'inventory.manage',
    'sales.view',
    'sales.create',
    'sales.approve',
    'sales.complete',
    'finance.view_summary',
    'marketing.view',
    'marketing.create',
    'marketing.schedule',
    'marketing.publish',
    'marketing.manage',
    'reports.view',
    'reports.export',
    'audit.view',
    'integrations.view',
    'integrations.manage',
    'settings.view',
    'settings.manage',
    'system.health.view',
    'notifications.view',
  ],
  captador: [...OPS_LEADS, 'reports.view'],
  avaliador: [
    'admin.dashboard.view',
    'leads.view',
    'vehicles.view',
    'vehicles.evaluate',
    'vehicles.documents.view',
    'acquisitions.view',
    'notifications.view',
  ],
  vendedor: [
    'admin.dashboard.view',
    'leads.view',
    'vehicles.view',
    'inventory.view',
    'sales.view',
    'sales.create',
    'notifications.view',
  ],
  marketing: [
    'marketing.view',
    'marketing.create',
    'marketing.schedule',
    'marketing.publish',
    'marketing.manage',
    'integrations.view',
    'notifications.view',
  ],
  financeiro: [
    'admin.dashboard.view',
    'vehicles.view',
    'acquisitions.view',
    'inventory.view',
    'sales.view',
    'finance.view_summary',
    'finance.view_details',
    'finance.edit',
    'finance.approve',
    'finance.export',
    'reports.view',
    'reports.export',
    'notifications.view',
  ],
  auditor: [
    'admin.dashboard.view',
    'users.view',
    'roles.view',
    'teams.view',
    'leads.view',
    'vehicles.view',
    'acquisitions.view',
    'inventory.view',
    'sales.view',
    'finance.view_summary',
    'marketing.view',
    'reports.view',
    'audit.view',
    'integrations.view',
    'settings.view',
    'notifications.view',
  ],
}

export const SECTION_PERMISSION: Record<AdminSection, Permission | null> = {
  agenda: 'leads.view',
  dashboard: 'admin.dashboard.view',
  usuarios: 'users.view',
  equipes: 'teams.view',
  leads: 'leads.view',
  qualificados: 'leads.view',
  veiculos: 'vehicles.view',
  puxador: 'leads.view',
  contrato: 'leads.view',
  prompt: 'leads.view',
  anotacoes: 'leads.view',
  compra: 'leads.view',
  venda: 'leads.view',
  cv: 'leads.view',
  pagamentos: 'leads.view',
  relatorio: 'leads.view',
  avaliacoes: 'vehicles.evaluate',
  aquisicoes: 'acquisitions.view',
  estoque: 'inventory.view',
  catalogo: 'inventory.manage',
  vendas: 'sales.view',
  financeiro: 'finance.view_summary',
  marketing: 'marketing.view',
  relatorios: 'reports.view',
  integracoes: 'integrations.view',
  auditoria: 'audit.view',
  configuracoes: 'settings.view',
  saude: 'system.health.view',
  ajustes: null,
}

export const PERMISSION_CATEGORIES: {
  id: string
  label: string
  permissions: Permission[]
}[] = [
  {
    id: 'admin',
    label: 'Administração',
    permissions: [
      'admin.dashboard.view',
      'users.view',
      'users.invite',
      'users.edit',
      'users.suspend',
      'users.sessions.revoke',
      'roles.view',
      'roles.create',
      'roles.edit',
      'roles.assign',
      'teams.view',
      'teams.manage',
      'settings.view',
      'settings.manage',
      'settings.security',
      'system.health.view',
      'notifications.view',
    ],
  },
  {
    id: 'ops',
    label: 'Operação',
    permissions: [
      'leads.view',
      'leads.create',
      'leads.edit',
      'leads.assign',
      'leads.export',
      'vehicles.view',
      'vehicles.create',
      'vehicles.edit',
      'vehicles.evaluate',
      'vehicles.documents.view',
      'acquisitions.view',
      'acquisitions.propose',
      'acquisitions.approve',
      'acquisitions.complete',
      'inventory.view',
      'inventory.manage',
      'sales.view',
      'sales.create',
      'sales.approve',
      'sales.complete',
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    permissions: [
      'finance.view_summary',
      'finance.view_details',
      'finance.edit',
      'finance.approve',
      'finance.export',
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    permissions: [
      'marketing.view',
      'marketing.create',
      'marketing.schedule',
      'marketing.publish',
      'marketing.manage',
    ],
  },
  {
    id: 'governance',
    label: 'Governança',
    permissions: [
      'reports.view',
      'reports.export',
      'audit.view',
      'integrations.view',
      'integrations.manage',
    ],
  },
]

export type LeadPipelineStage =
  | 'NOVO'
  | 'EM_ATENDIMENTO'
  | 'QUALIFICADO'
  | 'AGUARDANDO_DADOS'
  | 'AVALIACAO'
  | 'PROPOSTA'
  | 'NEGOCIACAO'
  | 'DOCUMENTACAO'
  | 'COMPRADO'
  | 'SEM_CONTATO'
  | 'PAUSADO'
  | 'RECUSADO'
  | 'PERDIDO'
  | 'DUPLICADO'

export const LEAD_PIPELINE_STAGES: LeadPipelineStage[] = [
  'NOVO',
  'EM_ATENDIMENTO',
  'QUALIFICADO',
  'AGUARDANDO_DADOS',
  'AVALIACAO',
  'PROPOSTA',
  'NEGOCIACAO',
  'DOCUMENTACAO',
  'COMPRADO',
]

export const LEAD_ALT_STAGES: LeadPipelineStage[] = [
  'SEM_CONTATO',
  'PAUSADO',
  'RECUSADO',
  'PERDIDO',
  'DUPLICADO',
]

export type AcquisitionStage =
  | 'EM_ANALISE'
  | 'AVALIADO'
  | 'PROPOSTA_PREPARADA'
  | 'PROPOSTA_ENVIADA'
  | 'NEGOCIACAO'
  | 'APROVADO'
  | 'DOCUMENTACAO'
  | 'PAGAMENTO'
  | 'COMPRADO'
  | 'PAUSADO'
  | 'RECUSADO'
  | 'CANCELADO'
  | 'EXPIRADO'

export type InventoryStatus =
  | 'EM_PREPARACAO'
  | 'DISPONIVEL'
  | 'RESERVADO'
  | 'EM_NEGOCIACAO'
  | 'VENDIDO'
  | 'BLOQUEADO'
  | 'MANUTENCAO'
  | 'CANCELADO'
  | 'ARQUIVADO'

export function normalizeRole(role: string | undefined | null): UserRole {
  if (role === 'funcionario') return 'captador'
  if (role === 'owner' || role === 'proprietario') return 'admin'
  if (typeof role === 'string' && ALL_ROLES.includes(role as UserRole)) {
    return role as UserRole
  }
  return 'captador'
}

export function permissionsForRole(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[normalizeRole(role)]]
}

export function hasPermission(
  role: UserRole | string,
  permission: Permission,
  extras: Permission[] = [],
): boolean {
  const r = normalizeRole(role)
  const base = ROLE_PERMISSIONS[r]
  if (base.includes(permission)) return true
  return extras.includes(permission)
}

export function canAccessSection(
  role: UserRole | string,
  section: AdminSection,
  extras: Permission[] = [],
): boolean {
  const required = SECTION_PERMISSION[section]
  if (required === null) return true
  return hasPermission(role, required, extras)
}

/** Seções que o cargo sozinho não abre, mas os extras liberam. */
export function sectionsUnlockedByExtras(
  role: UserRole | string,
  extras: Permission[] = [],
): AdminSection[] {
  if (!extras.length) return []
  const r = normalizeRole(role)
  return (Object.keys(SECTION_PERMISSION) as AdminSection[]).filter((s) => {
    const required = SECTION_PERMISSION[s]
    if (required === null) return false
    return (
      !hasPermission(r, required, []) && hasPermission(r, required, extras)
    )
  })
}

/** Extras que realmente ampliam o cargo (remove o que já vem no role). */
export function normalizePermissionExtras(
  role: UserRole | string,
  extras: Permission[] | unknown,
): Permission[] {
  if (!Array.isArray(extras)) return []
  const base = new Set(permissionsForRole(normalizeRole(role)))
  const out: Permission[] = []
  for (const raw of extras) {
    const p = String(raw) as Permission
    if (!ALL_PERMISSIONS.includes(p)) continue
    if (base.has(p)) continue
    if (!out.includes(p)) out.push(p)
  }
  return out
}

export function sectionsForRole(role: UserRole | string): AdminSection[] {
  const r = normalizeRole(role)
  return (Object.keys(SECTION_PERMISSION) as AdminSection[]).filter((s) =>
    canAccessSection(r, s),
  )
}

export function defaultSectionForRole(role: UserRole | string): AdminSection {
  const r = normalizeRole(role)
  if (r === 'marketing' && canAccessSection(r, 'marketing')) {
    return 'marketing'
  }
  if (r === 'captador' && canAccessSection(r, 'leads')) {
    return 'leads'
  }
  return sectionsForRole(r)[0] || 'dashboard'
}

/** Não pode conceder papel com rank >= ao próprio (exceto admin). */
export function canAssignRole(
  actor: UserRole | string,
  target: UserRole | string,
): boolean {
  const a = normalizeRole(actor)
  const t = normalizeRole(target)
  if (a === 'admin') return true
  if (!hasPermission(a, 'roles.assign') && !hasPermission(a, 'users.invite')) {
    return false
  }
  return ROLE_RANK[t] < ROLE_RANK[a]
}

/** Não pode conceder permissão que o ator não possui. */
export function canGrantPermissions(
  actorRole: UserRole | string,
  actorExtras: Permission[],
  requested: Permission[],
): boolean {
  return requested.every((p) => hasPermission(actorRole, p, actorExtras))
}

export function countActiveOwners(
  users: { role: string; status?: AccountStatus; active?: boolean }[],
): number {
  return users.filter((u) => {
    if (normalizeRole(u.role) !== 'admin') return false
    if (u.status === 'ARCHIVED' || u.status === 'SUSPENDED') return false
    if (u.active === false) return false
    return true
  }).length
}

export function canSuspendOrArchiveUser(
  actor: UserRole | string,
  target: { id: string; role: string; status?: AccountStatus; active?: boolean },
  actorId: string,
  allUsers: { role: string; status?: AccountStatus; active?: boolean }[],
): { ok: boolean; error?: string } {
  if (target.id === actorId) {
    return { ok: false, error: 'Você não pode suspender a própria conta' }
  }
  if (!canAssignRole(actor, target.role)) {
    return { ok: false, error: 'Sem permissão para alterar este usuário' }
  }
  if (
    normalizeRole(target.role) === 'admin' &&
    countActiveOwners(allUsers) <= 1
  ) {
    return {
      ok: false,
      error: 'Não é possível remover ou suspender o último proprietário',
    }
  }
  return { ok: true }
}

export function sanitizeAuditMeta(
  meta: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const blocked = [
    'password',
    'password_hash',
    'password_salt',
    'token',
    'secret',
    'access_token',
    'refresh_token',
    'mfa_secret',
    'authorization',
    'cookie',
    'invite_token',
    'token_hash',
  ]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase()
    if (blocked.some((b) => key.includes(b))) continue
    if (typeof v === 'string' && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`
      continue
    }
    out[k] = v
  }
  return out
}

export function maskPhone(phone: string | undefined | null): string {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length < 4) return '****'
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`
}

export function maskPlate(plate: string | undefined | null): string {
  const p = String(plate || '').trim().toUpperCase()
  if (p.length < 3) return '***'
  return `${p.slice(0, 3)}****`
}

export function parsePageParams(search: URLSearchParams) {
  const page = Math.max(1, Number(search.get('page') || 1) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number(search.get('pageSize') || 20) || 20),
  )
  const q = String(search.get('q') || '')
    .trim()
    .toLowerCase()
  const sort = String(search.get('sort') || 'created_at')
  const order = search.get('order') === 'asc' ? 'asc' : 'desc'
  return { page, pageSize, q, sort, order }
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; page: number; pageSize: number; pages: number } {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pages)
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pages,
  }
}

export function workspaceLabel(role: UserRole | string): string {
  switch (normalizeRole(role)) {
    case 'admin':
      return 'Proprietário · visão total'
    case 'gerente':
      return 'Administração'
    case 'captador':
      return 'Captador de veículos'
    case 'avaliador':
      return 'Avaliação'
    case 'vendedor':
      return 'Vendas'
    case 'marketing':
      return 'Marketing'
    case 'financeiro':
      return 'Financeiro'
    case 'auditor':
      return 'Auditoria · leitura'
  }
}

export function roleDescription(role: UserRole | string): string {
  return ROLE_DESCRIPTIONS[normalizeRole(role)]
}

const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  'admin.dashboard.view': 'Ver visão geral',
  'users.view': 'Ver usuários',
  'users.invite': 'Criar / convidar usuários',
  'users.edit': 'Editar usuários',
  'users.suspend': 'Suspender / excluir usuários',
  'users.sessions.revoke': 'Revogar sessões',
  'roles.view': 'Ver cargos',
  'roles.assign': 'Atribuir cargos',
  'teams.view': 'Ver equipes',
  'teams.manage': 'Gerenciar equipes',
  'leads.view': 'Ver leads',
  'leads.create': 'Criar leads',
  'leads.edit': 'Editar leads',
  'leads.assign': 'Atribuir leads',
  'leads.export': 'Exportar leads',
  'vehicles.view': 'Ver veículos / FIPE',
  'vehicles.edit': 'Editar veículos',
  'vehicles.evaluate': 'Avaliar veículos',
  'acquisitions.view': 'Ver aquisições',
  'acquisitions.propose': 'Propor aquisição',
  'acquisitions.approve': 'Aprovar aquisição',
  'inventory.view': 'Ver estoque',
  'inventory.manage': 'Gerenciar estoque',
  'sales.view': 'Ver vendas',
  'sales.create': 'Criar vendas',
  'finance.view_summary': 'Ver resumo financeiro',
  'finance.view_details': 'Ver detalhes financeiros',
  'marketing.view': 'Ver marketing',
  'marketing.create': 'Criar posts',
  'marketing.schedule': 'Agendar posts',
  'marketing.publish': 'Publicar posts',
  'marketing.manage': 'Gerenciar Instagram / Meta',
  'reports.view': 'Ver relatórios',
  'reports.export': 'Exportar relatórios',
  'audit.view': 'Ver auditoria',
  'integrations.view': 'Ver integrações',
  'integrations.manage': 'Gerenciar integrações',
  'settings.view': 'Ver configurações',
  'settings.manage': 'Editar configurações',
  'system.health.view': 'Ver saúde do sistema',
}

export function permissionLabel(p: Permission): string {
  return PERMISSION_LABELS[p] || p
}
