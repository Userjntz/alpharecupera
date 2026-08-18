import { WHATSAPP_NUMBERS } from '../config'
import type { Answers } from '../data/quiz'

/** Mensagem curta e humana — menos chance da pessoa apagar/errar. */
export function buildClientWhatsAppMessage(a: Answers): string {
  const first = (a.nome || '').trim().split(/\s+/)[0] || 'cliente'
  const carro =
    [a.marca, a.modelo, a.ano].filter(Boolean).join(' ').trim() || 'meu carro'
  return `Oi, sou ${first}. Fiz a análise no site e quero vender meu ${carro}. Pode me atender?`
}

export function companyWhatsAppNumber(): string {
  const list = WHATSAPP_NUMBERS.map((n) => String(n).replace(/\D/g, '')).filter(
    (n) => n.length >= 12,
  )
  return list[0] || ''
}

export function isCompanyWhatsAppReady(): boolean {
  const n = companyWhatsAppNumber()
  if (!n) return false
  // placeholder antigo do projeto
  if (n.includes('999999999')) return false
  return true
}

/** Link que abre o app/web do WhatsApp com texto pronto (wa.me = melhor no celular). */
export function buildCompanyWhatsAppUrl(message: string): string | null {
  const phone = companyWhatsAppNumber()
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

/** Fallback web (alguns androids/desktops). */
export function buildCompanyWhatsAppUrlAlt(message: string): string | null {
  const phone = companyWhatsAppNumber()
  if (!phone) return null
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`
}

/** Exibe o número de forma legível: (11) 99999-9999 */
export function formatCompanyWhatsAppDisplay(phone = companyWhatsAppNumber()): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    const ddd = d.slice(2, 4)
    const n = d.slice(4)
    return `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}`
  }
  if (d.length === 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4)
    const n = d.slice(4)
    return `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`
  }
  return phone
}
