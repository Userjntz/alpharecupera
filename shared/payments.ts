export type PaymentDirection = 'entrada' | 'saida'

export type PaymentSource = 'compra' | 'venda' | 'manual'

export type PaymentStatus = 'pago' | 'pendente'

export type PaymentRecord = {
  id: string
  created_at: string
  updated_at: string
  direction: PaymentDirection
  source: PaymentSource
  status: PaymentStatus
  /** valor em número (BRL) */
  amount: number
  /** texto original digitado */
  amount_label: string
  /** YYYY-MM-DD */
  date: string
  description: string
  /** vínculo com caso C/V */
  dealId?: string | null
  vehicle_label?: string
  cliente_nome?: string
  created_by?: string
  created_by_name?: string
}

export function makePaymentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `pay_${crypto.randomUUID()}`
  }
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Extrai número de strings tipo "R$ 42.000,00" ou "42000" */
export function parseMoney(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const s = String(raw || '').trim()
  if (!s) return 0
  // se tem vírgula decimal BR
  if (s.includes(',')) {
    const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  const digits = s.replace(/[^\d.-]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(n: number) {
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  })
}

export function sanitizePaymentInput(
  body: Record<string, unknown>,
  prev?: PaymentRecord,
): Omit<
  PaymentRecord,
  'id' | 'created_at' | 'created_by' | 'created_by_name'
> {
  const str = (k: string, fallback = '') => {
    const v = body[k]
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    return fallback
  }
  const directionRaw = str('direction', prev?.direction || 'entrada')
  const direction: PaymentDirection =
    directionRaw === 'saida' ? 'saida' : 'entrada'
  const sourceRaw = str('source', prev?.source || 'manual')
  const source: PaymentSource =
    sourceRaw === 'compra' || sourceRaw === 'venda' ? sourceRaw : 'manual'
  const statusRaw = str('status', prev?.status || 'pago')
  const status: PaymentStatus = statusRaw === 'pendente' ? 'pendente' : 'pago'

  const amountLabel = str('amount_label', prev?.amount_label || '')
  const amountFromBody =
    typeof body.amount === 'number'
      ? body.amount
      : parseMoney(amountLabel || str('amount', String(prev?.amount || 0)))

  return {
    updated_at: new Date().toISOString(),
    direction,
    source,
    status,
    amount: amountFromBody,
    amount_label: amountLabel || formatMoney(amountFromBody),
    date: str('date', prev?.date || new Date().toISOString().slice(0, 10)),
    description: str('description', prev?.description || ''),
    dealId:
      body.dealId === null
        ? null
        : typeof body.dealId === 'string'
          ? body.dealId
          : prev?.dealId ?? null,
    vehicle_label: str('vehicle_label', prev?.vehicle_label || ''),
    cliente_nome: str('cliente_nome', prev?.cliente_nome || ''),
  }
}

export type PaymentTotals = {
  entradas: number
  saidas: number
  saldo: number
  pendenteEntrada: number
  pendenteSaida: number
}

export function sumPayments(items: PaymentRecord[]): PaymentTotals {
  let entradas = 0
  let saidas = 0
  let pendenteEntrada = 0
  let pendenteSaida = 0
  for (const p of items) {
    if (p.status === 'pendente') {
      if (p.direction === 'entrada') pendenteEntrada += p.amount
      else pendenteSaida += p.amount
      continue
    }
    if (p.direction === 'entrada') entradas += p.amount
    else saidas += p.amount
  }
  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    pendenteEntrada,
    pendenteSaida,
  }
}

type DealLike = {
  id: string
  marca?: string
  modelo?: string
  ano?: string
  cliente_nome?: string
  compra_valor?: string
  compra_data?: string
  venda_valor?: string
  venda_data?: string
  updated_at?: string
  created_at?: string
}

function vehicleLabel(d: DealLike) {
  return [d.marca, d.modelo, d.ano].filter(Boolean).join(' ').trim() || 'Veículo'
}

/** Gera/atualiza pagamentos automáticos a partir dos casos C/V */
export function syncPaymentsFromDeals(
  deals: DealLike[],
  existing: PaymentRecord[],
): PaymentRecord[] {
  const byId = new Map(existing.map((p) => [p.id, p]))
  const now = new Date().toISOString()

  for (const deal of deals) {
    const compraAmt = parseMoney(deal.compra_valor)
    const compraId = `auto_compra_${deal.id}`
    if (compraAmt > 0) {
      const prev = byId.get(compraId)
      byId.set(compraId, {
        id: compraId,
        created_at: prev?.created_at || deal.created_at || now,
        updated_at: now,
        direction: 'saida',
        source: 'compra',
        status: prev?.status || 'pago',
        amount: compraAmt,
        amount_label: deal.compra_valor || formatMoney(compraAmt),
        date: deal.compra_data || (deal.created_at || now).slice(0, 10),
        description: prev?.description || `Compra · ${vehicleLabel(deal)}`,
        dealId: deal.id,
        vehicle_label: vehicleLabel(deal),
        cliente_nome: deal.cliente_nome || '',
        created_by: prev?.created_by,
        created_by_name: prev?.created_by_name,
      })
    } else if (byId.has(compraId) && byId.get(compraId)?.source === 'compra') {
      byId.delete(compraId)
    }

    const vendaAmt = parseMoney(deal.venda_valor)
    const vendaId = `auto_venda_${deal.id}`
    if (vendaAmt > 0) {
      const prev = byId.get(vendaId)
      byId.set(vendaId, {
        id: vendaId,
        created_at: prev?.created_at || deal.updated_at || now,
        updated_at: now,
        direction: 'entrada',
        source: 'venda',
        status: prev?.status || 'pago',
        amount: vendaAmt,
        amount_label: deal.venda_valor || formatMoney(vendaAmt),
        date: deal.venda_data || (deal.updated_at || now).slice(0, 10),
        description: prev?.description || `Venda · ${vehicleLabel(deal)}`,
        dealId: deal.id,
        vehicle_label: vehicleLabel(deal),
        cliente_nome: deal.cliente_nome || '',
        created_by: prev?.created_by,
        created_by_name: prev?.created_by_name,
      })
    } else if (byId.has(vendaId) && byId.get(vendaId)?.source === 'venda') {
      byId.delete(vendaId)
    }
  }

  return [...byId.values()].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')),
  )
}

