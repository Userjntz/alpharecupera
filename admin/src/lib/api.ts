import type { LeadRecord } from '@shared/leads'
import type { CvDeal, CvDocument, CvDocumentKind } from '@shared/cv'
import type { AgendaEvent, PanelNotice } from '@shared/agenda'
import type { PaymentRecord, PaymentTotals } from '@shared/payments'
import type { Permission, UserRole } from './roles'

const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  'http://localhost:8787'

const TOKEN_KEY = 'alpha_admin_token'

export type { UserRole }

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole | string
  active?: boolean
  status?: string
  permissionExtras?: Permission[]
  created_at?: string
  last_activity_at?: string | null
  slug?: string
}

export type IntegrationStatus = {
  id: string
  name: string
  ok: boolean
  status: 'ok' | 'parcial' | 'erro' | string
  detail?: string
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function api<T>(
  path: string,
  init: RequestInit = {},
  auth = false,
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const separator = path.includes('?') ? '&' : '?'
  const url = `${API_URL}${path}${separator}_=${Date.now()}`

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    if (/load failed|failed to fetch|networkerror|network error/i.test(raw)) {
      throw new Error('Não foi possível conectar à API. Tente de novo.')
    }
    throw err instanceof Error ? err : new Error(raw)
  }
  if (res.status === 401 && auth) {
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
  return (await res.json()) as T
}

export async function login(email: string, password: string) {
  const data = await api<{ ok: boolean; token: string; user: AuthUser }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  )
  setToken(data.token)
  return data.user
}

export async function fetchMe() {
  return api<{ ok: boolean; user: AuthUser }>('/auth/me', {}, true)
}

export async function fetchLeads(qualified?: boolean): Promise<LeadRecord[]> {
  const params =
    qualified === undefined ? '' : `?qualified=${qualified ? 'true' : 'false'}`
  const data = await api<{ leads: LeadRecord[] }>(`/leads${params}`, {}, true)
  return data.leads || []
}

export async function createLead(lead: LeadRecord): Promise<LeadRecord> {
  const data = await api<{ ok: boolean; lead?: LeadRecord }>(
    '/leads',
    { method: 'POST', body: JSON.stringify(lead) },
    true,
  )
  return data.lead?.id ? data.lead : lead
}

export async function updateLead(
  id: string,
  patch: Partial<LeadRecord>,
): Promise<LeadRecord> {
  const data = await api<{ ok: boolean; lead: LeadRecord }>(
    `/leads/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    true,
  )
  return data.lead
}

export async function fetchIntegrations() {
  return api<{
    ok: boolean
    integrations: IntegrationStatus[]
  }>('/integrations', {}, true)
}

export async function fetchUsers() {
  const data = await api<{ ok: boolean; users: AuthUser[] }>(
    '/users',
    {},
    true,
  )
  return data.users || []
}

export async function createUser(input: {
  name: string
  email: string
  password: string
  role: UserRole
}) {
  const data = await api<{ ok: boolean; user: AuthUser }>(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    true,
  )
  return data.user
}

export async function updateUser(
  id: string,
  patch: {
    name?: string
    password?: string
    role?: UserRole
    active?: boolean
  },
) {
  const data = await api<{ ok: boolean; user: AuthUser }>(
    `/users/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    true,
  )
  return data.user
}

export async function deleteUser(id: string) {
  await api<{ ok: boolean }>(
    `/users/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    true,
  )
}

export async function fetchCvDeals(status?: string): Promise<CvDeal[]> {
  const qs = new URLSearchParams({ pageSize: '200' })
  if (status) qs.set('status', status)
  const data = await api<{ ok: boolean; items?: CvDeal[] }>(
    `/admin/cv?${qs.toString()}`,
    {},
    true,
  )
  return data.items || []
}

export async function createCvFromLead(leadId: string): Promise<{
  deal: CvDeal
  existing: boolean
}> {
  const data = await api<{ ok: boolean; deal: CvDeal; existing?: boolean }>(
    '/admin/cv/from-lead',
    { method: 'POST', body: JSON.stringify({ leadId }) },
    true,
  )
  return { deal: data.deal, existing: Boolean(data.existing) }
}

export async function createCvDeal(
  input: Partial<CvDeal>,
): Promise<CvDeal> {
  const data = await api<{ ok: boolean; deal: CvDeal }>(
    '/admin/cv',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
  return data.deal
}

export async function updateCvDeal(
  id: string,
  patch: Partial<CvDeal>,
): Promise<CvDeal> {
  const data = await api<{ ok: boolean; deal: CvDeal }>(
    `/admin/cv/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    true,
  )
  return data.deal
}

export async function deleteCvDeal(id: string) {
  await api<{ ok: boolean }>(
    `/admin/cv/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    true,
  )
}

export async function uploadCvDocument(
  dealId: string,
  file: File,
  kind: CvDocumentKind,
): Promise<{ deal: CvDeal; document: CvDocument }> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)
  const token = getToken()
  const res = await fetch(
    `${API_URL}/admin/cv/${encodeURIComponent(dealId)}/documents?_=${Date.now()}`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      cache: 'no-store',
    },
  )
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
  return (await res.json()) as { deal: CvDeal; document: CvDocument }
}

export async function deleteCvDocument(dealId: string, docId: string) {
  const data = await api<{ ok: boolean; deal: CvDeal }>(
    `/admin/cv/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(docId)}`,
    { method: 'DELETE' },
    true,
  )
  return data.deal
}

export async function fetchAgenda(from?: string, to?: string) {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const q = qs.toString()
  const data = await api<{ ok: boolean; items?: AgendaEvent[] }>(
    `/admin/agenda${q ? `?${q}` : ''}`,
    {},
    true,
  )
  return data.items || []
}

export async function createAgendaEvent(input: Partial<AgendaEvent>) {
  const data = await api<{ ok: boolean; event?: AgendaEvent; error?: string }>(
    '/admin/agenda',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
  if (!data.event) throw new Error(data.error || 'Falha ao salvar reunião')
  return data.event
}

export async function updateAgendaEvent(
  id: string,
  patch: Partial<AgendaEvent>,
) {
  const data = await api<{ ok: boolean; event: AgendaEvent }>(
    `/admin/agenda/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    true,
  )
  return data.event
}

export async function deleteAgendaEvent(id: string) {
  await api<{ ok: boolean }>(
    `/admin/agenda/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    true,
  )
}

export async function fetchNotices(activeOnly = false) {
  const data = await api<{ ok: boolean; items?: PanelNotice[] }>(
    `/admin/notices${activeOnly ? '?active=1' : ''}`,
    {},
    true,
  )
  return data.items || []
}

export async function createNotice(input: Partial<PanelNotice>) {
  const data = await api<{ ok: boolean; notice: PanelNotice }>(
    '/admin/notices',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
  return data.notice
}

export async function updateNotice(id: string, patch: Partial<PanelNotice>) {
  const data = await api<{ ok: boolean; notice: PanelNotice }>(
    `/admin/notices/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    true,
  )
  return data.notice
}

export async function deleteNotice(id: string) {
  await api<{ ok: boolean }>(
    `/admin/notices/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    true,
  )
}

export async function fetchPayments(): Promise<{
  items: PaymentRecord[]
  totals: PaymentTotals
}> {
  const data = await api<{
    ok: boolean
    items?: PaymentRecord[]
    totals?: PaymentTotals
  }>('/admin/payments', {}, true)
  return {
    items: data.items || [],
    totals: data.totals || {
      entradas: 0,
      saidas: 0,
      saldo: 0,
      pendenteEntrada: 0,
      pendenteSaida: 0,
    },
  }
}

export async function createPayment(input: Partial<PaymentRecord>) {
  const data = await api<{ ok: boolean; payment: PaymentRecord }>(
    '/admin/payments',
    { method: 'POST', body: JSON.stringify(input) },
    true,
  )
  return data.payment
}

export async function updatePayment(
  id: string,
  patch: Partial<PaymentRecord>,
) {
  const data = await api<{ ok: boolean; payment: PaymentRecord }>(
    `/admin/payments/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    true,
  )
  return data.payment
}

export async function deletePayment(id: string) {
  await api<{ ok: boolean }>(
    `/admin/payments/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    true,
  )
}

export async function syncPayments() {
  const data = await api<{
    ok: boolean
    items?: PaymentRecord[]
    totals?: PaymentTotals
  }>('/admin/payments/sync', { method: 'POST', body: '{}' }, true)
  return {
    items: data.items || [],
    totals: data.totals || {
      entradas: 0,
      saidas: 0,
      saldo: 0,
      pendenteEntrada: 0,
      pendenteSaida: 0,
    },
  }
}
