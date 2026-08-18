import type { Answers, LeadQuality } from '../data/quiz'
import { normalizePhoneDigits } from './format'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

const PIXEL_ID =
  (import.meta.env.VITE_FB_PIXEL_ID as string | undefined) || '1731098261462427'

let initialized = false
let leadSent = false

export function initFacebookPixel() {
  if (initialized || typeof window === 'undefined' || !PIXEL_ID) return
  if (typeof window.fbq === 'function') {
    initialized = true
    return
  }

  type FbqFn = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void
    queue: unknown[]
    push: FbqFn
    loaded: boolean
    version: string
  }

  const fbq = function (...args: unknown[]) {
    const self = fbq as FbqFn
    if (self.callMethod) self.callMethod(...args)
    else self.queue.push(args)
  } as FbqFn

  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  window.fbq('init', PIXEL_ID)
  window.fbq('track', 'PageView')
  initialized = true
}

function firstName(nome: string) {
  return nome.trim().split(/\s+/)[0] || ''
}

/**
 * Envia Lead completo no Pixel — só lead qualificado, 1x por sessão.
 * Advanced Matching + todos os dados do quiz para inteligência do Meta.
 */
export function trackQualifiedLead(
  answers: Answers,
  meta: { quality: LeadQuality; score: number },
) {
  if (!PIXEL_ID || typeof window.fbq !== 'function' || leadSent) return

  const digits = normalizePhoneDigits(answers.telefone)
  const eventId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lead_${Date.now()}`

  const matching: Record<string, string> = {
    country: 'br',
  }
  if (digits.length === 11) matching.ph = `55${digits}`
  if (answers.nome.trim()) matching.fn = firstName(answers.nome).toLowerCase()
  if (answers.cidade.trim()) matching.ct = answers.cidade.trim().toLowerCase()
  if (answers.estado.trim()) matching.st = answers.estado.trim().toLowerCase()
  if (digits.length === 11) matching.external_id = `55${digits}`

  window.fbq('init', PIXEL_ID, matching)

  const customData: Record<string, string | number> = {
    content_name: 'quiz_qualificado',
    content_category: meta.quality,
    lead_quality: meta.quality,
    lead_score: meta.score,
    nome: answers.nome,
    telefone: digits.length === 11 ? `55${digits}` : answers.telefone,
    estado: answers.estado,
    cidade: answers.cidade,
    banco: answers.banco,
    marca: answers.marca,
    modelo: answers.modelo,
    ano: answers.ano,
    parcelas_atrasadas: answers.parcelasAtrasadas,
    parcelas_pagas: answers.parcelasPagas,
    deu_entrada: answers.deuEntrada,
    valor_entrada: answers.valorEntrada || '0',
    tem_debito: answers.temDebito,
    valor_debito: answers.valorDebito || '0',
    quilometragem: answers.quilometragem,
    usa_aplicativo: answers.usaParaAplicativo,
    veiculo: `${answers.marca} ${answers.modelo} ${answers.ano}`.trim(),
  }

  window.fbq('track', 'Lead', customData, { eventID: eventId })
  leadSent = true
}
