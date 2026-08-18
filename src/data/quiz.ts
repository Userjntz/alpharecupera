export type Answers = {
  nome: string
  telefone: string
  estado: string
  cidade: string
  banco: string
  marca: string
  modelo: string
  ano: string
  parcelasAtrasadas: string
  valorEntrada: string
  deuEntrada: 'sim' | 'nao' | ''
  parcelasPagas: string
  temDebito: 'sim' | 'nao' | ''
  valorDebito: string
  quilometragem: string
  usaParaAplicativo: 'sim' | 'nao' | ''
  /** URLs públicas das fotos do carro (opcional) */
  fotosUrls: string[]
}

import type { LeadQuality } from '../../shared/leads'
import {
  BANCOS_BONS as SHARED_BANCOS_BONS,
  BANCOS_DIFICIEIS as SHARED_BANCOS_DIFICIEIS,
  evaluateLeadQuality,
  isGoodBank as sharedIsGoodBank,
  isHardBank as sharedIsHardBank,
} from '../../shared/leadQuality'

export type { LeadQuality }

export const EMPTY_ANSWERS: Answers = {
  nome: '',
  telefone: '',
  estado: '',
  cidade: '',
  banco: '',
  marca: '',
  modelo: '',
  ano: '',
  parcelasAtrasadas: '',
  valorEntrada: '',
  deuEntrada: '',
  parcelasPagas: '',
  temDebito: '',
  valorDebito: '',
  quilometragem: '',
  usaParaAplicativo: '',
  fotosUrls: [],
}

export const TOTAL_STEPS = 10

export const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const BANCOS = [
  'Itaú',
  'Bradesco',
  'Santander',
  'Pan',
  'BV',
  'Banco do Brasil',
  'Caixa',
  'Safra',
  'C6 Bank',
  'Outro banco',
]

/** Bancos preferidos — mais fáceis de trabalhar */
export const BANCOS_BONS = SHARED_BANCOS_BONS

/** Bancos mais difíceis de quitar / negociar */
export const BANCOS_DIFICIEIS = SHARED_BANCOS_DIFICIEIS

export const PARCELAS_ATRASADAS = [
  'Nenhuma',
  '1 a 3',
  '4 a 6',
  '7 a 10',
  'Mais de 10',
]

export const PARCELAS_PAGAS = [
  'Nenhuma',
  '1 a 3',
  '4 a 12',
  '13 ou mais',
]

export const ANOS = Array.from({ length: 20 }, (_, i) => String(2026 - i))

export function isGoodBank(banco: string) {
  return sharedIsGoodBank(banco)
}

export function isHardBank(banco: string) {
  return sharedIsHardBank(banco)
}

/**
 * Segmentação:
 * - Bom: 2015+, km ≤ 150 mil, banco bom, situação ok
 * - Médio: mistura (1 problema)
 * - Ruim: vários problemas (2+), ex.: ano < 2015 e km alto
 */
export function evaluateLead(a: Answers): {
  qualified: boolean
  quality: LeadQuality
  score: number
} {
  const result = evaluateLeadQuality({
    ano: a.ano,
    quilometragem: a.quilometragem,
    banco: a.banco,
    parcelasAtrasadas: a.parcelasAtrasadas,
    temDebito: a.temDebito,
    usaParaAplicativo: a.usaParaAplicativo,
  })
  return {
    qualified: result.qualified,
    quality: result.quality,
    score: result.score,
  }
}

export function isQualified(a: Answers): boolean {
  return evaluateLead(a).qualified
}

export function resultCopy(qualified: boolean, nome?: string) {
  const first = nome?.trim().split(/\s+/)[0]
  if (qualified) {
    return {
      emoji: '✅',
      title: first ? `${first}, falta só um passo!` : 'Falta só um passo!',
      text: 'Toque no botão verde para falar no WhatsApp agora. A mensagem já vai pronta — é só enviar.',
    }
  }
  return {
    emoji: '🚫',
    title: 'Seu carro não se qualifica',
    text: 'Com base nas respostas, o veículo não se encaixa no nosso perfil de compra neste momento.',
  }
}

/** @deprecated use buildClientWhatsAppMessage from lib/whatsapp */
export function buildWhatsAppMessage(a: Answers): string {
  const first = (a.nome || '').trim().split(/\s+/)[0] || 'cliente'
  const carro = [a.marca, a.modelo, a.ano].filter(Boolean).join(' ').trim()
  return [
    `Oi! Sou ${first}.`,
    `Quero vender meu ${carro || 'veículo'}.`,
    a.cidade && a.estado ? `Estou em ${a.cidade}/${a.estado}.` : '',
    a.banco ? `Banco: ${a.banco}.` : '',
    'Pode me atender?',
  ]
    .filter(Boolean)
    .join('\n')
}
