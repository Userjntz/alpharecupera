import type { Answers, LeadQuality } from '../data/quiz'
import { makeLeadId, type LeadRecord } from '../../shared/leads'
import { parseCaptadorSlugFromSearch } from '../../shared/captadorCampaign'
import { normalizePhoneDigits } from './format'

const CAPTADOR_SLUG_KEY = 'alpha_quiz_captador'

export function readQuizCaptadorSlug(): string {
  if (typeof window === 'undefined') return ''
  try {
    const fromUrl = parseCaptadorSlugFromSearch(window.location.search)
    if (fromUrl) {
      sessionStorage.setItem(CAPTADOR_SLUG_KEY, fromUrl)
      return fromUrl
    }
    sessionStorage.removeItem(CAPTADOR_SLUG_KEY)
    return ''
  } catch {
    return parseCaptadorSlugFromSearch(
      typeof window !== 'undefined' ? window.location.search : '',
    )
  }
}

const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  (import.meta.env.PROD
    ? 'https://alpha-recupera-api.alpharecupera.workers.dev'
    : 'http://localhost:8787')

export function buildLeadRecord(
  answers: Answers,
  meta: { qualified: boolean; quality: LeadQuality; score: number },
  captadorSlug = readQuizCaptadorSlug(),
): LeadRecord {
  const digits = normalizePhoneDigits(answers.telefone)
  return {
    id: makeLeadId(),
    created_at: new Date().toISOString(),
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
    valor_entrada: answers.valorEntrada,
    tem_debito: answers.temDebito,
    valor_debito: answers.valorDebito,
    quilometragem: answers.quilometragem,
    usa_aplicativo: answers.usaParaAplicativo,
    fotos: answers.fotosUrls?.length ? answers.fotosUrls : undefined,
    qualified: meta.qualified,
    quality: meta.quality,
    score: meta.score,
    status: 'aberto',
    captadorSlug: captadorSlug || undefined,
  }
}

export async function saveLead(lead: LeadRecord): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
  } catch (err) {
    console.error('Falha ao salvar lead na API:', err)
    // Fallback local — útil se a API estiver offline (mesmo browser)
    try {
      const key = 'alpha_recupera_leads_fallback'
      const prev = JSON.parse(localStorage.getItem(key) || '[]') as LeadRecord[]
      prev.push(lead)
      localStorage.setItem(key, JSON.stringify(prev))
    } catch {
      /* ignore */
    }
  }
}
