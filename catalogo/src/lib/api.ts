import type { PublicCatalogVehicle } from '@shared/catalog'

const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  'https://alpha-recupera-api.alpharecupera.workers.dev'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as T & { ok?: boolean; error?: string }
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Erro ${res.status}`,
    )
  }
  return data
}

export async function fetchCatalogVehicles(q = '') {
  const qs = q ? `?q=${encodeURIComponent(q)}` : ''
  return get<{ ok: boolean; vehicles: PublicCatalogVehicle[]; total: number }>(
    `/catalog/vehicles${qs}`,
  )
}

export function formatPrice(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return 'Sob consulta'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatKm(km: string) {
  const n = Number(String(km).replace(/\D/g, ''))
  if (!n) return km || '—'
  return `${n.toLocaleString('pt-BR')} km`
}

export function companyWhatsApp(): string {
  const raw =
    (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) || ''
  const digits = raw.replace(/\D/g, '')
  if (!digits || digits.length < 12 || digits.includes('999999999')) return ''
  return digits
}
