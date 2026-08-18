const BASE = 'https://fipe.parallelum.com.br/api/v2'

export type FipeVehicleType = 'cars' | 'motorcycles' | 'trucks'

export type FipeNamed = { code: string; name: string }

export type FipeDetail = {
  vehicleType: number
  price: string
  brand: string
  model: string
  modelYear: number
  fuel: string
  codeFipe: string
  referenceMonth: string
  fuelAcronym?: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      text.slice(0, 160) || `Falha na FIPE (${res.status})`,
    )
  }
  return res.json() as Promise<T>
}

export function fetchFipeBrands(type: FipeVehicleType) {
  return getJson<FipeNamed[]>(`/${type}/brands`)
}

export function fetchFipeModels(type: FipeVehicleType, brandId: string) {
  return getJson<FipeNamed[]>(`/${type}/brands/${brandId}/models`)
}

export function fetchFipeYears(
  type: FipeVehicleType,
  brandId: string,
  modelId: string,
) {
  return getJson<FipeNamed[]>(
    `/${type}/brands/${brandId}/models/${modelId}/years`,
  )
}

export function fetchFipeDetail(
  type: FipeVehicleType,
  brandId: string,
  modelId: string,
  yearId: string,
) {
  return getJson<FipeDetail>(
    `/${type}/brands/${brandId}/models/${modelId}/years/${yearId}`,
  )
}

function norm(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchScore(candidate: string, query: string) {
  const c = norm(candidate)
  const q = norm(query)
  if (!q || !c) return 0
  if (c === q) return 100
  if (c.startsWith(q) || q.startsWith(c)) return 90
  if (c.includes(q) || q.includes(c)) return 75
  const words = q.split(' ').filter((w) => w.length > 1)
  if (!words.length) return 0
  const hits = words.filter((w) => c.includes(w)).length
  return Math.round((hits / words.length) * 60)
}

function pickBest(items: FipeNamed[], query: string): FipeNamed | null {
  let best: FipeNamed | null = null
  let bestScore = 0
  for (const item of items) {
    const s = matchScore(item.name, query)
    if (s > bestScore) {
      best = item
      bestScore = s
    }
  }
  return bestScore >= 40 ? best : null
}

let brandsCache: FipeNamed[] | null = null
let brandsCacheAt = 0

async function getBrandsCached(type: FipeVehicleType) {
  const now = Date.now()
  if (brandsCache && now - brandsCacheAt < 1000 * 60 * 60) return brandsCache
  brandsCache = await fetchFipeBrands(type)
  brandsCacheAt = now
  return brandsCache
}

export type FipeLookupResult = {
  detail: FipeDetail
  brand: FipeNamed
  model: FipeNamed
  year: FipeNamed
}

/**
 * Resolve FIPE a partir dos textos do lead (marca / modelo / ano).
 * Cascata: brands → models → years → detail.
 */
export async function lookupFipeByNames(
  marca: string,
  modelo: string,
  ano: string,
  type: FipeVehicleType = 'cars',
): Promise<FipeLookupResult> {
  const brandQ = String(marca || '').trim()
  const modelQ = String(modelo || '').trim()
  const yearQ = String(ano || '').trim()
  if (!brandQ || !modelQ || !yearQ) {
    throw new Error('Marca, modelo e ano são necessários para a FIPE')
  }

  const brands = await getBrandsCached(type)
  const brand = pickBest(brands, brandQ)
  if (!brand) throw new Error(`Marca não encontrada na FIPE: ${brandQ}`)

  const models = await fetchFipeModels(type, brand.code)
  const model = pickBest(models, modelQ)
  if (!model) throw new Error(`Modelo não encontrado na FIPE: ${modelQ}`)

  const years = await fetchFipeYears(type, brand.code, model.code)
  const yearExact = years.find((y) => y.name.startsWith(yearQ))
  const year =
    yearExact ||
    years.find((y) => y.name.includes(yearQ)) ||
    pickBest(years, yearQ)
  if (!year) throw new Error(`Ano não encontrado na FIPE: ${yearQ}`)

  const detail = await fetchFipeDetail(type, brand.code, model.code, year.code)
  return { detail, brand, model, year }
}

export const FIPE_TYPE_OPTIONS: {
  id: FipeVehicleType
  label: string
}[] = [
  { id: 'cars', label: 'Carros' },
  { id: 'motorcycles', label: 'Motos' },
  { id: 'trucks', label: 'Caminhões' },
]
