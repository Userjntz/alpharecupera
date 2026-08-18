/** Calculadora de proposta do captador (compra de carro financiado). */

export type PropostaInput = {
  fipe: number
  valorParcela: number
  quantasVezes: number
  parcelasPagas: number
  parcelasAtrasadas: number
  debitos: number
  km?: number
  marca?: string
  modelo?: string
}

export type PropostaResult = {
  fipe: number
  valorParcela: number
  quantasVezes: number
  parcelasPagas: number
  parcelasAtrasadas: number
  parcelasRestantes: number
  totalContrato: number
  valorPago: number
  valorAtraso: number
  saldoBanco: number
  debitos: number
  obrigacao: number
  vsFipe: number
  acimaFipe: boolean
  pagarMin: number
  pagarMax: number
  pagarSugerido: number
  percentualSugerido: number
  missing: string[]
}

export function parseMoneyBRL(raw: string): number {
  const s = String(raw || '').trim()
  if (!s) return 0
  const compact = s.replace(/[^\d,.-]/g, '')
  if (!compact) return 0

  // 1.250,00 ou 45.000,90 → ponto milhar, vírgula decimal
  if (compact.includes(',')) {
    const n = Number(compact.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  // 45.000 / 4.500 / 1.250.000 → ponto é milhar, não decimal
  if (/^\d{1,3}(\.\d{3})+$/.test(compact)) {
    const n = Number(compact.replace(/\./g, ''))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const n = Number(compact)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Converte "4 a 6", "Mais de 10", "12" em quantidade. */
export function parseCount(raw: string): number {
  const s = String(raw || '').trim().toLowerCase()
  if (!s || s === 'nenhuma' || s === 'nenhum' || s === '—') return 0
  if (s.includes('mais de 10')) return 12
  if (s.includes('13 ou mais')) return 15
  const nums = (s.match(/\d+/g) || []).map(Number).filter((n) => Number.isFinite(n))
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2)
  if (nums.length === 1) return nums[0]
  return 0
}

export function formatBRL(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function parseKm(raw: string): number {
  const n = Number(String(raw || '').replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * 1. Total do contrato = parcela × quantas vezes
 * 2. Já pago = parcela × pagas
 * 3. Em atraso = parcela × atrasadas
 * 4. Saldo no banco = parcela × (vezes − pagas)
 * 5. Débitos só aparecem na comparação com a FIPE (não saem do valor a pagar)
 * 6. Pagar ao cliente: 10–20% da FIPE, conforme as parcelas
 *    (mais perto de 10% se o saldo no banco come a tabela; 20% se já pagou bastante)
 */
export function calcProposta(input: PropostaInput): PropostaResult {
  const fipe = Math.max(0, input.fipe || 0)
  const valorParcela = Math.max(0, input.valorParcela || 0)
  const pagas = Math.max(0, Math.round(input.parcelasPagas || 0))
  const atrasadas = Math.max(0, Math.round(input.parcelasAtrasadas || 0))
  let vezes = Math.max(0, Math.round(input.quantasVezes || 0))
  if (vezes < pagas) vezes = pagas
  const restantes = Math.max(0, vezes - pagas)
  const debitos = Math.max(0, input.debitos || 0)

  const missing: string[] = []
  if (fipe <= 0) missing.push('FIPE')
  if (valorParcela <= 0) missing.push('valor da parcela')
  if (vezes <= 0) missing.push('quantas vezes')

  const totalContrato = valorParcela * vezes
  const valorPago = valorParcela * pagas
  const valorAtraso = valorParcela * atrasadas
  const saldoBanco = valorParcela * restantes
  const obrigacao = saldoBanco + debitos
  const vsFipe = fipe - obrigacao

  let percentualSugerido = 15
  if (fipe > 0) {
    const folgaParcelas = (fipe - saldoBanco) / fipe
    percentualSugerido = Math.round(clamp(15 + folgaParcelas * 10, 10, 20))
  }
  const pagarMin = fipe * 0.1
  const pagarMax = fipe * 0.2
  const pagarSugerido = fipe * (percentualSugerido / 100)

  return {
    fipe,
    valorParcela,
    quantasVezes: vezes,
    parcelasPagas: pagas,
    parcelasAtrasadas: atrasadas,
    parcelasRestantes: restantes,
    totalContrato,
    valorPago,
    valorAtraso,
    saldoBanco,
    debitos,
    obrigacao,
    vsFipe,
    acimaFipe: obrigacao > fipe && fipe > 0,
    pagarMin,
    pagarMax,
    pagarSugerido,
    percentualSugerido,
    missing,
  }
}

export type PropostaDraftLike = {
  valor_fipe?: string
  valor_parcela?: string
  quantas_vezes?: string
  parcelas_pagas?: string
  parcelas_atrasadas?: string
  valor_debito?: string
  quilometragem?: string
  marca?: string
  modelo?: string
}

function pickMoney(raw?: string): number {
  return parseMoneyBRL(String(raw || ''))
}

function filled(raw?: string) {
  return Boolean(String(raw || '').trim())
}

/** Lê FIPE, parcela, vezes, atraso e débitos no texto das anotações. */
export function extractFromAnnotationText(
  text: string,
): Partial<PropostaInput> {
  const out: Partial<PropostaInput> = {}
  for (const rawLine of String(text || '').split(/\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const l = line.toLowerCase()
    if (
      /vs\s*fipe|%\s*da\s*fipe|pagar ao cliente|total do contrato|já pago|ja pago|saldo no banco|obrigação|obrigacao/.test(
        l,
      )
    ) {
      continue
    }

    const moneyAfter = (re: RegExp) => {
      const m = line.match(re)
      return m ? parseMoneyBRL(m[1]) : 0
    }

    if (out.fipe == null && /fipe/.test(l) && !/vs/.test(l)) {
      const n = moneyAfter(/fipe[^0-9r$]*?(?:r\$\s*)?([\d.,]+)/i)
      if (n > 0) out.fipe = n
    }
    if (
      out.valorParcela == null &&
      /valor\s+(da\s+)?parcela|^parcela\b/.test(l) &&
      !/parcelas/.test(l)
    ) {
      const n = moneyAfter(/(?:parcela)[^0-9r$]*?(?:r\$\s*)?([\d.,]+)/i)
      if (n > 0) out.valorParcela = n
    }
    if (out.quantasVezes == null && /quantas\s+vezes|\bvezes\b/.test(l)) {
      const n = parseCount((line.match(/(\d+\s*a\s*\d+|\d+)/) || [])[1] || '')
      if (n > 0) out.quantasVezes = n
    }
    if (out.parcelasPagas == null && /parcelas?\s+pagas|\bpagas\b/.test(l)) {
      out.parcelasPagas = parseCount(
        (line.match(/(\d+\s*a\s*\d+|nenhuma|\d+)/i) || [])[1] || '',
      )
    }
    if (
      out.parcelasAtrasadas == null &&
      /parcelas?\s+atrasadas|\batrasadas\b/.test(l)
    ) {
      out.parcelasAtrasadas = parseCount(
        (line.match(/(\d+\s*a\s*\d+|nenhuma|\d+)/i) || [])[1] || '',
      )
    }
    if (out.debitos == null && /d[eé]bitos?/.test(l)) {
      const n = moneyAfter(/(?:d[eé]bitos?)[^0-9r$]*?(?:r\$\s*)?([\d.,]+)/i)
      if (n > 0) out.debitos = n
    }
    if (out.km == null && /\bkm\b|quilometr/.test(l)) {
      const n = parseKm(line)
      if (n > 0) out.km = n
    }
  }
  return out
}

function fipeFromLead(lead: {
  valor_fipe?: string
  fipe?: { price?: string; price_number?: number | null } | null
}): number {
  const typed = pickMoney(lead.valor_fipe)
  if (typed > 0) return typed
  const fromPrice = pickMoney(lead.fipe?.price || '')
  if (fromPrice > 0) return fromPrice
  const n = lead.fipe?.price_number
  return n && n > 0 ? n : 0
}

/** Junta ficha, FIPE e texto das anotações para a calculadora. */
export function extractPropostaInput(
  lead: {
    valor_fipe?: string
    valor_parcela?: string
    quantas_vezes?: string
    parcelas_pagas?: string
    parcelas_atrasadas?: string
    valor_debito?: string
    quilometragem?: string
    marca?: string
    modelo?: string
    fipe?: { price?: string; price_number?: number | null } | null
    annotations?: { title?: string; body?: string }[]
  },
  draft?: PropostaDraftLike,
): PropostaInput {
  const notes = extractFromAnnotationText(
    (lead.annotations || [])
      .map((n) => `${n.title || ''}\n${n.body || ''}`)
      .join('\n'),
  )

  const money = (draftVal?: string, leadVal?: string, fallback = 0) => {
    if (filled(draftVal)) {
      const n = pickMoney(draftVal)
      if (n > 0) return n
    }
    if (filled(leadVal)) {
      const n = pickMoney(leadVal)
      if (n > 0) return n
    }
    return fallback
  }

  const count = (draftVal?: string, leadVal?: string, fallback = 0) => {
    if (filled(draftVal)) return parseCount(draftVal || '')
    if (filled(leadVal)) return parseCount(leadVal || '')
    return fallback
  }

  const kmDraft = parseKm(draft?.quilometragem || '')
  const kmLead = parseKm(lead.quilometragem || '')

  return {
    fipe: money(draft?.valor_fipe, lead.valor_fipe, fipeFromLead(lead) || notes.fipe || 0),
    valorParcela: money(
      draft?.valor_parcela,
      lead.valor_parcela,
      notes.valorParcela || 0,
    ),
    quantasVezes: count(
      draft?.quantas_vezes,
      lead.quantas_vezes,
      notes.quantasVezes || 0,
    ),
    parcelasPagas: count(
      draft?.parcelas_pagas,
      lead.parcelas_pagas,
      notes.parcelasPagas || 0,
    ),
    parcelasAtrasadas: count(
      draft?.parcelas_atrasadas,
      lead.parcelas_atrasadas,
      notes.parcelasAtrasadas || 0,
    ),
    debitos: money(draft?.valor_debito, lead.valor_debito, notes.debitos || 0),
    km: kmDraft || kmLead || notes.km || 0,
    marca: (draft?.marca || lead.marca || '').trim(),
    modelo: (draft?.modelo || lead.modelo || '').trim(),
  }
}

export function propostaAnnotationBody(r: PropostaResult): string {
  const linhas = [
    'Proposta calculada',
    `FIPE: ${formatBRL(r.fipe)}`,
    `Parcela: ${formatBRL(r.valorParcela)} × ${r.quantasVezes} vezes`,
    `Total do contrato: ${formatBRL(r.totalContrato)}`,
    `Já pago: ${formatBRL(r.valorPago)} (${r.parcelasPagas} parcelas)`,
    `Em atraso: ${formatBRL(r.valorAtraso)} (${r.parcelasAtrasadas} parcelas)`,
    `Saldo no banco: ${formatBRL(r.saldoBanco)} (${r.parcelasRestantes} restantes)`,
    `Débitos: ${formatBRL(r.debitos)}`,
    `Obrigação (saldo + débitos): ${formatBRL(r.obrigacao)}`,
    r.fipe
      ? `Vs FIPE: ${r.acimaFipe ? 'acima' : 'abaixo'} ${formatBRL(Math.abs(r.vsFipe))}`
      : '',
    `Pagar ao cliente: ${formatBRL(r.pagarSugerido)} (${r.percentualSugerido}% da FIPE)`,
    `Faixa: ${formatBRL(r.pagarMin)} a ${formatBRL(r.pagarMax)} (10–20%)`,
  ]
  return linhas.filter(Boolean).join('\n')
}
