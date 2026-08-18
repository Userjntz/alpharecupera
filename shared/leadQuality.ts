import type { LeadQuality } from './leads'

/** Entrada mínima para classificar um lead (quiz ou registro do admin). */
export type LeadQualityInput = {
  ano: string
  quilometragem: string
  banco: string
  parcelasAtrasadas: string
  temDebito: string
  usaParaAplicativo: string
}

/** Bancos preferidos — mais fáceis de trabalhar */
export const BANCOS_BONS = ['Itaú', 'Bradesco', 'Santander', 'Pan', 'BV']

/** Bancos mais difíceis de quitar / negociar */
export const BANCOS_DIFICIEIS = ['Safra', 'Outro banco']

export const KM_LIMITE_BOM = 150_000

function normalizeBank(banco: string) {
  return banco.trim().toLowerCase()
}

export function isGoodBank(banco: string) {
  const b = normalizeBank(banco)
  return BANCOS_BONS.some((name) => b.includes(normalizeBank(name)))
}

export function isHardBank(banco: string) {
  const b = normalizeBank(banco)
  if (BANCOS_DIFICIEIS.some((name) => b.includes(normalizeBank(name)))) return true
  if (b.includes('digimais') || b.includes('digi mais')) return true
  return false
}

function isBadSituation(a: LeadQualityInput) {
  const lateHeavy =
    a.parcelasAtrasadas === '7 a 10' || a.parcelasAtrasadas === 'Mais de 10'
  const lateMedium = a.parcelasAtrasadas === '4 a 6'
  const appWear = a.usaParaAplicativo === 'sim'
  const debt = a.temDebito === 'sim'

  if (lateHeavy) return true
  if (lateMedium && appWear && debt) return true
  return false
}

function parseKm(raw: string) {
  return parseInt(String(raw || '').replace(/\D/g, ''), 10) || 0
}

function parseYear(raw: string) {
  return parseInt(String(raw || ''), 10) || 0
}

/**
 * Regras:
 * - Ruim: ano < 2015, km > 150 mil, banco difícil, situação ruim (atraso alto etc.)
 * - Bom: tudo bom (2015+, km ≤ 150 mil, banco bom, situação ok)
 * - Médio: mistura (alguma coisa boa + alguma ruim)
 * - Ruim no total: várias coisas ruins (2+)
 */
export function evaluateLeadQuality(a: LeadQualityInput): {
  qualified: boolean
  quality: LeadQuality
  score: number
  badCount: number
  reasons: string[]
} {
  const year = parseYear(a.ano)
  const km = parseKm(a.quilometragem)
  const goodBank = isGoodBank(a.banco)
  const hardBank = isHardBank(a.banco)
  const badSit = isBadSituation(a)
  const tooOld = year > 0 && year < 2015
  const highKm = km > KM_LIMITE_BOM
  const appWear = a.usaParaAplicativo === 'sim'

  const reasons: string[] = []
  if (tooOld) reasons.push('ano abaixo de 2015')
  if (highKm) reasons.push('km acima de 150 mil')
  if (hardBank) reasons.push('banco difícil')
  if (badSit) reasons.push('situação financeira ruim')
  if (appWear) reasons.push('uso em aplicativo')

  const badCount = reasons.length

  const allGood =
    year >= 2015 &&
    km > 0 &&
    km <= KM_LIMITE_BOM &&
    goodBank &&
    !badSit &&
    !appWear

  let quality: LeadQuality
  if (allGood) {
    quality = 'quente'
  } else if (badCount >= 2) {
    quality = 'frio'
  } else if (badCount === 1) {
    quality = 'morno'
  } else {
    // 0 ruins, mas não “tudo bom” (ex.: banco neutro, km zerado)
    quality = 'morno'
  }

  // score só para ordenação / debug no admin
  let score = 50
  if (year >= 2018) score += 25
  else if (year >= 2015) score += 15
  else if (year > 0) score -= 25

  if (goodBank) score += 20
  else if (hardBank) score -= 20
  else score -= 5

  if (km > 0 && km <= KM_LIMITE_BOM) score += 20
  else if (km > KM_LIMITE_BOM) score -= 25

  if (a.parcelasAtrasadas === 'Nenhuma' || a.parcelasAtrasadas === '1 a 3') {
    score += 8
  }
  if (badSit) score -= 18
  if (appWear) score -= 8
  else if (a.usaParaAplicativo === 'nao') score += 5
  if (a.temDebito === 'nao') score += 3

  score = Math.max(0, Math.min(100, score))

  const qualified = quality !== 'frio'

  return { qualified, quality, score, badCount, reasons }
}

export function qualityLabel(quality: LeadQuality): 'Bom' | 'Médio' | 'Ruim' {
  if (quality === 'quente') return 'Bom'
  if (quality === 'morno') return 'Médio'
  return 'Ruim'
}

export function qualityBadgeClass(quality: LeadQuality): string {
  if (quality === 'quente') return 'bg-green-100 text-ok'
  if (quality === 'morno') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-bad'
}

/** Converte campos do lead salvo no admin/API para a classificação atual. */
export function evaluateStoredLead(lead: {
  ano?: string
  quilometragem?: string
  banco?: string
  parcelas_atrasadas?: string
  tem_debito?: string
  usa_aplicativo?: string
}) {
  return evaluateLeadQuality({
    ano: lead.ano || '',
    quilometragem: lead.quilometragem || '',
    banco: lead.banco || '',
    parcelasAtrasadas: lead.parcelas_atrasadas || '',
    temDebito: lead.tem_debito || '',
    usaParaAplicativo: lead.usa_aplicativo || '',
  })
}
