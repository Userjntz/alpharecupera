export type CvDealStatus = 'compra' | 'venda' | 'fechado'

/** Compatível com dados antigos no KV */
export function normalizeCvStatus(raw: unknown): CvDealStatus {
  const s = String(raw || '')
  if (s === 'venda' || s === 'em_venda') return 'venda'
  if (s === 'fechado' || s === 'vendido' || s === 'cv') return 'fechado'
  return 'compra'
}

export type CvDocumentKind = 'compra' | 'venda' | 'outro'

export type CvDocument = {
  id: string
  kind: CvDocumentKind
  name: string
  mime: string
  url: string
  size: number
  uploaded_at: string
  uploaded_by?: string
  storageName?: string
}

export type CvDeal = {
  id: string
  created_at: string
  updated_at: string
  status: CvDealStatus
  /** vínculo opcional com lead de origem */
  leadId?: string | null
  cliente_nome: string
  cliente_telefone: string
  marca: string
  modelo: string
  ano: string
  placa?: string
  km?: string
  banco?: string
  /** compra */
  compra_valor: string
  compra_data: string
  compra_obs?: string
  /** venda */
  venda_valor: string
  venda_data: string
  venda_comprador?: string
  venda_obs?: string
  docs: CvDocument[]
  created_by?: string
  created_by_name?: string
}

export type CvView = 'compra' | 'venda' | 'cv'

export function makeCvId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function sanitizeCvInput(
  body: Record<string, unknown>,
  prev?: CvDeal,
): Omit<CvDeal, 'id' | 'created_at' | 'docs' | 'created_by' | 'created_by_name'> {
  const str = (k: string, fallback = '') => {
    const v = body[k]
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    return fallback
  }
  const status = normalizeCvStatus(
    body.status !== undefined ? body.status : prev?.status || 'compra',
  )

  return {
    updated_at: new Date().toISOString(),
    status,
    leadId:
      body.leadId === null
        ? null
        : typeof body.leadId === 'string'
          ? body.leadId
          : prev?.leadId ?? null,
    cliente_nome: str('cliente_nome', prev?.cliente_nome || ''),
    cliente_telefone: str('cliente_telefone', prev?.cliente_telefone || ''),
    marca: str('marca', prev?.marca || ''),
    modelo: str('modelo', prev?.modelo || ''),
    ano: str('ano', prev?.ano || ''),
    placa: str('placa', prev?.placa || ''),
    km: str('km', prev?.km || ''),
    banco: str('banco', prev?.banco || ''),
    compra_valor: str('compra_valor', prev?.compra_valor || ''),
    compra_data: str('compra_data', prev?.compra_data || ''),
    compra_obs: str('compra_obs', prev?.compra_obs || ''),
    venda_valor: str('venda_valor', prev?.venda_valor || ''),
    venda_data: str('venda_data', prev?.venda_data || ''),
    venda_comprador: str('venda_comprador', prev?.venda_comprador || ''),
    venda_obs: str('venda_obs', prev?.venda_obs || ''),
  }
}

export function cvTitle(d: Pick<CvDeal, 'marca' | 'modelo' | 'ano'>) {
  return [d.marca, d.modelo, d.ano].filter(Boolean).join(' ').trim() || 'Veículo'
}

export function dealMatchesView(deal: CvDeal, view: CvView): boolean {
  const status = normalizeCvStatus(deal.status)
  if (view === 'compra') return status === 'compra'
  if (view === 'venda') return status === 'venda'
  return status === 'fechado'
}

export function statusLabel(status: CvDealStatus): string {
  if (status === 'venda') return 'Em venda'
  if (status === 'fechado') return 'Compra e venda'
  return 'Em compra'
}
