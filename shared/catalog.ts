/** Veículo publicado no catálogo público (estoque da empresa). */
export type CatalogVehicleRecord = {
  id: string
  created_at: string
  updated_at: string
  /** Se false, some da vitrine pública */
  published: boolean
  marca: string
  modelo: string
  ano: string
  quilometragem: string
  cor: string
  combustivel: string
  cambio: string
  /** Preço em reais (número inteiro). */
  listPrice: number | null
  description: string
  fotos: string[]
  /** URL de vídeo (YouTube, Vimeo ou mp4) */
  video: string
  cidade: string
  estado: string
  featured: boolean
  /** Vínculos opcionais com o operacional interno */
  inventoryId: string | null
  vehicleId: string | null
  leadId: string | null
}

/** Shape seguro para a vitrine (sem IDs internos nem PII). */
export type PublicCatalogVehicle = {
  id: string
  marca: string
  modelo: string
  ano: string
  quilometragem: string
  cor: string
  combustivel: string
  cambio: string
  listPrice: number | null
  description: string
  fotos: string[]
  video: string
  cidade: string
  estado: string
  featured: boolean
  updated_at: string
}

export function normalizeFotos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u) || u.startsWith('/'))
    .slice(0, 20)
}

function normalizeVideo(value: unknown): string {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v.slice(0, 500)
  return ''
}

export function sanitizeCatalogInput(
  body: Record<string, unknown>,
  prev?: CatalogVehicleRecord | null,
): Omit<CatalogVehicleRecord, 'id' | 'created_at'> {
  const listPriceRaw = body.listPrice
  let listPrice: number | null = prev?.listPrice ?? null
  if (listPriceRaw === null || listPriceRaw === '') listPrice = null
  else if (listPriceRaw !== undefined) {
    const n = Number(listPriceRaw)
    listPrice = Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  }

  return {
    updated_at: new Date().toISOString(),
    published:
      body.published === undefined
        ? (prev?.published ?? true)
        : Boolean(body.published),
    marca: String(body.marca ?? prev?.marca ?? '').trim().slice(0, 80),
    modelo: String(body.modelo ?? prev?.modelo ?? '').trim().slice(0, 120),
    ano: String(body.ano ?? prev?.ano ?? '').trim().slice(0, 10),
    quilometragem: String(body.quilometragem ?? prev?.quilometragem ?? '')
      .trim()
      .slice(0, 40),
    cor: String(body.cor ?? prev?.cor ?? '').trim().slice(0, 40),
    combustivel: String(body.combustivel ?? prev?.combustivel ?? '')
      .trim()
      .slice(0, 40),
    cambio: String(body.cambio ?? prev?.cambio ?? '').trim().slice(0, 40),
    listPrice,
    description: String(body.description ?? prev?.description ?? '')
      .trim()
      .slice(0, 2000),
    fotos:
      body.fotos !== undefined
        ? normalizeFotos(body.fotos)
        : (prev?.fotos ?? []),
    video:
      body.video !== undefined
        ? normalizeVideo(body.video)
        : (prev?.video ?? ''),
    cidade: String(body.cidade ?? prev?.cidade ?? '').trim().slice(0, 80),
    estado: String(body.estado ?? prev?.estado ?? '')
      .trim()
      .toUpperCase()
      .slice(0, 2),
    featured:
      body.featured === undefined
        ? (prev?.featured ?? false)
        : Boolean(body.featured),
    inventoryId:
      body.inventoryId === undefined
        ? (prev?.inventoryId ?? null)
        : body.inventoryId
          ? String(body.inventoryId)
          : null,
    vehicleId:
      body.vehicleId === undefined
        ? (prev?.vehicleId ?? null)
        : body.vehicleId
          ? String(body.vehicleId)
          : null,
    leadId:
      body.leadId === undefined
        ? (prev?.leadId ?? null)
        : body.leadId
          ? String(body.leadId)
          : null,
  }
}

export function toPublicCatalogVehicle(
  v: CatalogVehicleRecord,
): PublicCatalogVehicle {
  return {
    id: v.id,
    marca: v.marca,
    modelo: v.modelo,
    ano: v.ano,
    quilometragem: v.quilometragem,
    cor: v.cor,
    combustivel: v.combustivel,
    cambio: v.cambio,
    listPrice: v.listPrice,
    description: v.description,
    fotos: normalizeFotos(v.fotos),
    video: normalizeVideo(v.video),
    cidade: v.cidade,
    estado: v.estado,
    featured: Boolean(v.featured),
    updated_at: v.updated_at,
  }
}

export function catalogTitle(
  v: Pick<CatalogVehicleRecord, 'marca' | 'modelo' | 'ano'>,
) {
  return [v.marca, v.modelo].filter(Boolean).join(' ').trim() || 'Veículo'
}

/** Mensagem pronta do WhatsApp para um carro do catálogo. */
export function catalogWhatsAppMessage(
  v: Pick<
    PublicCatalogVehicle,
    'marca' | 'modelo' | 'ano' | 'listPrice' | 'quilometragem'
  >,
) {
  const title = catalogTitle(v)
  const ano = v.ano ? ` ${v.ano}` : ''
  const price =
    v.listPrice != null && Number.isFinite(v.listPrice)
      ? v.listPrice.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
      : null
  const bits = [
    `Oi! Vi o ${title}${ano} no catálogo da Alpha Recupera e tenho interesse.`,
  ]
  if (price) bits.push(`Preço anunciado: ${price}.`)
  if (v.quilometragem) bits.push(`Km: ${v.quilometragem}.`)
  bits.push('Pode me passar mais detalhes?')
  return bits.join(' ')
}

/** Embed YouTube/Vimeo a partir da URL. */
export function videoEmbedUrl(url: string): string | null {
  const u = String(url || '').trim()
  if (!u) return null
  try {
    const parsed = new URL(u)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v')
      if (id) return `https://www.youtube.com/embed/${id}`
      const shorts = parsed.pathname.match(/\/shorts\/([^/]+)/)
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`
      const embed = parsed.pathname.match(/\/embed\/([^/]+)/)
      if (embed) return `https://www.youtube.com/embed/${embed[1]}`
    }
    if (host.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }
  return null
}

export function isDirectVideo(url: string) {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url)
}
