export type LeadQuality = 'quente' | 'morno' | 'frio'

export type LeadStatus = 'aberto' | 'finalizado'

/** Snapshot da tabela FIPE ligado ao carro do lead */
export type LeadFipeData = {
  price: string
  price_number: number | null
  brand: string
  model: string
  modelYear: number
  fuel: string
  codeFipe: string
  referenceMonth: string
  fetched_at: string
  match_brand?: string
  match_model?: string
  match_year?: string
  source?: 'auto' | 'manual'
}

export type LeadFipeStatus = 'idle' | 'loading' | 'ok' | 'error' | 'not_found'

/** Anotação sobre o carro / cliente (auto ou manual) */
export type LeadAnnotation = {
  id: string
  kind: 'auto' | 'manual'
  title: string
  body: string
  created_at: string
  updated_at?: string
  author_name?: string
  author_id?: string
}

export type LeadRecord = {
  id: string
  created_at: string
  nome: string
  telefone: string
  estado: string
  cidade: string
  banco: string
  marca: string
  modelo: string
  ano: string
  parcelas_atrasadas: string
  parcelas_pagas: string
  deu_entrada: string
  valor_entrada: string
  tem_debito: string
  valor_debito: string
  quilometragem: string
  usa_aplicativo: string
  /** URLs públicas das fotos do carro enviadas no quiz */
  fotos?: string[]
  qualified: boolean
  quality: LeadQuality
  score: number
  /** aberto = aparece no dashboard; finalizado = atendimento iniciado */
  status?: LeadStatus
  contacted_at?: string
  finalized_at?: string
  /** FIPE automática do veículo do lead */
  fipe?: LeadFipeData | null
  fipe_status?: LeadFipeStatus
  fipe_error?: string
  /** Anotações organizadas por cliente/carro */
  annotations?: LeadAnnotation[]
  /** Campos preenchidos pelo captador nas anotações */
  valor_parcela?: string
  quantas_vezes?: string
  valor_fechado?: string
  /** FIPE digitada na ficha quando a busca automática não puxa */
  valor_fipe?: string
  /** Captador dono do lead (campanha ?c=) */
  assigneeId?: string
  assigneeName?: string
  captadorSlug?: string
  /** quiz = anúncio; manual = fora do anúncio */
  origem?: 'quiz' | 'manual'
  /** Quem criou o lead no painel (fora do anúncio) */
  createdById?: string
}

export function isLeadOpen(lead: Pick<LeadRecord, 'status'>) {
  return lead.status !== 'finalizado'
}

export function makeLeadId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function makeAnnotationId(prefix = 'note') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function mergeLeadLists(
  server: LeadRecord[],
  local: LeadRecord[],
): LeadRecord[] {
  const map = new Map<string, LeadRecord>()
  for (const l of server) {
    if (l?.id) map.set(l.id, l)
  }
  for (const l of local) {
    if (l?.id && !map.has(l.id)) map.set(l.id, l)
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export function parseFipePriceNumber(price: string): number | null {
  const digits = String(price || '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}
