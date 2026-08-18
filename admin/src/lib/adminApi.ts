import { getToken, clearToken } from './api'
import type { UserRole, Permission, AccountStatus } from './roles'

const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  'http://localhost:8787'

export type AdminUser = {
  id: string
  name: string
  email: string
  role: UserRole | string
  status: AccountStatus | string
  active?: boolean
  teamId?: string | null
  teamName?: string | null
  managerId?: string | null
  permissionExtras?: Permission[]
  permissions?: Permission[]
  last_activity_at?: string | null
  created_at?: string
  invited_at?: string | null
  mfa_enabled?: boolean
  slug?: string
  campaignUrl?: string
}

export type PageResult<T> = {
  ok: boolean
  items: T[]
  total: number
  page: number
  pageSize: number
  pages: number
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const separator = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API_URL}${path}${separator}_=${Date.now()}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  if (res.status === 401) {
    clearToken()
    throw new Error('unauthorized')
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
  if (res.headers.get('Content-Type')?.includes('text/csv')) {
    return (await res.text()) as T
  }
  return (await res.json()) as T
}

export async function fetchAdminMeta() {
  return api<{
    ok: boolean
    roles: {
      id: UserRole
      label: string
      description: string
      permissions: Permission[]
    }[]
    permissions: Permission[]
    me: AdminUser
  }>('/admin/meta')
}

export async function fetchAdminDashboard(period = '30d') {
  return api<{
    ok: boolean
    period: string
    updatedAt: string
    kpis: Record<string, number | null>
    finance: {
      acquisitionCost: number
      extraCosts: number
      salesValue: number
      grossMargin: number
    } | null
    charts: {
      leadsByOrigin: { name: string; value: number }[]
      funnel: { stage: string; count: number }[]
    }
    alerts: { level: string; message: string }[]
  }>(`/admin/dashboard?period=${encodeURIComponent(period)}`)
}

export async function fetchAdminUsers(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<AdminUser>>(`/admin/users?${qs}`)
}

export async function fetchAdminUser(id: string) {
  return api<{
    ok: boolean
    user: AdminUser
    sessions: { id: string; created_at: string; expires_at: string }[]
    audit: unknown[]
  }>(`/admin/users/${encodeURIComponent(id)}`)
}

export async function patchAdminUser(
  id: string,
  patch: Record<string, unknown>,
) {
  return api<{ ok: boolean; user: AdminUser }>(
    `/admin/users/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function revokeUserSessions(id: string) {
  return api<{ ok: boolean; revoked: number }>(
    `/admin/users/${encodeURIComponent(id)}/sessions/revoke`,
    { method: 'POST', body: '{}' },
  )
}

export async function createAdminUser(input: {
  name: string
  email: string
  password: string
  role: UserRole
  teamId?: string | null
  permissionExtras?: Permission[]
  slug?: string
}) {
  return api<{ ok: boolean; user: AdminUser }>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Soft-delete: arquiva a conta (não remove histórico). */
export async function deleteAdminUser(id: string) {
  return patchAdminUser(id, { status: 'ARCHIVED', active: false })
}

export async function createInvite(input: {
  name: string
  email: string
  role: UserRole
  teamId?: string | null
  managerId?: string | null
  permissionExtras?: Permission[]
}) {
  return api<{
    ok: boolean
    invite: {
      id: string
      email: string
      name: string
      role: string
      status: string
      expires_at: string
    }
    inviteLink?: string
    emailConfigured?: boolean
  }>('/admin/invites', { method: 'POST', body: JSON.stringify(input) })
}

export async function fetchInvites() {
  return api<{ ok: boolean; invites: Record<string, unknown>[] }>(
    '/admin/invites',
  )
}

export async function revokeInvite(id: string) {
  return api<{ ok: boolean }>(
    `/admin/invites/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: '{}' },
  )
}

export async function resendInvite(id: string) {
  return api<{ ok: boolean; inviteLink?: string }>(
    `/admin/invites/${encodeURIComponent(id)}/resend`,
    { method: 'POST', body: '{}' },
  )
}

export async function acceptInvite(input: {
  token: string
  password: string
  name?: string
}) {
  return api<{ ok: boolean; token: string; user: AdminUser }>(
    '/admin/invites/accept',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function fetchTeams() {
  return api<{
    ok: boolean
    teams: {
      id: string
      name: string
      leaderId?: string | null
      memberCount: number
      members: { id: string; name: string; email: string; role: string }[]
      archived?: boolean
    }[]
  }>('/admin/teams')
}

export async function createTeam(name: string) {
  return api<{ ok: boolean; team: { id: string; name: string } }>(
    '/admin/teams',
    { method: 'POST', body: JSON.stringify({ name }) },
  )
}

export async function patchTeam(id: string, patch: Record<string, unknown>) {
  return api<{ ok: boolean; team: unknown }>(
    `/admin/teams/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function fetchAdminLeads(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/leads?${qs}`)
}

export async function patchAdminLead(
  id: string,
  patch: Record<string, unknown>,
) {
  return api<{ ok: boolean; lead: Record<string, unknown> }>(
    `/admin/leads/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function fetchVehicles(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/vehicles?${qs}`)
}

export async function fetchEvaluations(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/evaluations?${qs}`)
}

export async function createEvaluation(input: Record<string, unknown>) {
  return api<{ ok: boolean; evaluation: Record<string, unknown> }>(
    '/admin/evaluations',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function fetchAcquisitions(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/acquisitions?${qs}`)
}

export async function createAcquisition(input: Record<string, unknown>) {
  return api<{ ok: boolean; acquisition: Record<string, unknown> }>(
    '/admin/acquisitions',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function patchAcquisition(
  id: string,
  patch: Record<string, unknown>,
) {
  return api<{ ok: boolean; acquisition: Record<string, unknown> }>(
    `/admin/acquisitions/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function fetchInventory(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/inventory?${qs}`)
}

export async function fetchCatalogAdmin(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/catalog?${qs}`)
}

export async function createCatalogVehicle(input: Record<string, unknown>) {
  return api<{ ok: boolean; vehicle: Record<string, unknown> }>(
    '/admin/catalog',
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function patchCatalogVehicle(
  id: string,
  patch: Record<string, unknown>,
) {
  return api<{ ok: boolean; vehicle: Record<string, unknown> }>(
    `/admin/catalog/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function deleteCatalogVehicle(id: string) {
  return api<{ ok: boolean }>(`/admin/catalog/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function fetchSales(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/sales?${qs}`)
}

export async function fetchFinanceSummary() {
  return api<{
    ok: boolean
    summary: Record<string, number | null>
    moduleNote: string
  }>('/admin/finance/summary')
}

export async function fetchReportsOverview() {
  return api<{ ok: boolean; report: Record<string, unknown> }>(
    '/admin/reports/overview',
  )
}

export async function createExport(type: string, filters: Record<string, unknown> = {}) {
  return api<{
    ok: boolean
    export: {
      id: string
      downloadPath: string
      rowCount: number
      expires_at: string
    }
  }>('/admin/exports', {
    method: 'POST',
    body: JSON.stringify({ type, filters }),
  })
}

export async function fetchAudit(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  return api<PageResult<Record<string, unknown>>>(`/admin/audit?${qs}`)
}

export async function fetchOrgSettings() {
  return api<{ ok: boolean; settings: Record<string, unknown> }>(
    '/admin/settings',
  )
}

export async function patchOrgSettings(patch: Record<string, unknown>) {
  return api<{ ok: boolean; settings: Record<string, unknown> }>(
    '/admin/settings',
    { method: 'PATCH', body: JSON.stringify(patch) },
  )
}

export async function fetchNotifications() {
  return api<{ ok: boolean; notifications: Record<string, unknown>[] }>(
    '/admin/notifications',
  )
}

export async function markNotificationRead(id: string) {
  return api<{ ok: boolean }>(
    `/admin/notifications/${encodeURIComponent(id)}/read`,
    { method: 'POST', body: '{}' },
  )
}

export async function globalSearch(q: string) {
  return api<{
    ok: boolean
    results: { type: string; id: string; title: string; subtitle: string }[]
  }>(`/admin/search?q=${encodeURIComponent(q)}`)
}

export async function fetchSystemHealth() {
  return api<{ ok: boolean; health: Record<string, unknown> }>('/admin/health')
}

export async function fetchActionCenter() {
  return api<{
    ok: boolean
    actions: { type: string; id: string; title: string; href: string }[]
  }>('/admin/actions')
}

export async function fetchMarketingSummary() {
  return api<{ ok: boolean; summary: Record<string, unknown> }>(
    '/admin/marketing/summary',
  )
}
