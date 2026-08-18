/** DDDs válidos no Brasil (evita typo tipo 10, 23, 00…). */
export const BR_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export function formatMoneyInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('pt-BR')
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Normaliza entrada do WhatsApp do lead:
 * - remove +55 / 55 / 0 à esquerda
 * - corrige cola duplicada (5555…)
 * - limita a DDD + 9 dígitos (11)
 */
export function normalizePhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, '')

  // 5555119… → tira um 55 extra
  while (digits.startsWith('55') && digits.length > 13) {
    digits = digits.slice(2)
  }
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2)
  }
  // 0XX9… ou 055…
  while (digits.startsWith('0') && digits.length > 11) {
    digits = digits.slice(1)
  }
  if (digits.startsWith('0') && digits.length === 12) {
    digits = digits.slice(1)
  }

  // Se colou 13 dígitos sem 55 (raro), mantém os 11 finais com 9
  if (digits.length > 11 && digits.includes('9')) {
    // tenta achar bloco DDD + 9xxxxxxxx
    const m = digits.match(/(?:^|[^0-9])([1-9][1-9]9\d{8})$/)
    if (m) digits = m[1]
    else digits = digits.slice(-11)
  }

  return digits.slice(0, 11)
}

export function formatPhone(value: string): string {
  const digits = normalizePhoneDigits(value)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/** Exibe bonito mesmo se já formatado. */
export function displayPhone(value: string): string {
  return formatPhone(value) || '—'
}

export function isValidBRMobile(value: string): boolean {
  const digits = normalizePhoneDigits(value)
  if (digits.length !== 11) return false

  const ddd = Number(digits.slice(0, 2))
  if (!BR_DDDS.has(ddd)) return false

  // Celular BR: 9 dígitos após o DDD, começando com 9
  if (digits[2] !== '9') return false

  // Evita sequências óbvias (111111111 / 999999999)
  const sub = digits.slice(2)
  if (/^(\d)\1{8}$/.test(sub)) return false

  return true
}

export function phoneHint(value: string): string {
  const digits = normalizePhoneDigits(value)
  if (!digits) return 'Digite DDD + celular com o 9 (ex.: 11 9 9999-9999)'
  if (digits.length < 2) return 'Digite o DDD (2 dígitos)'
  const ddd = Number(digits.slice(0, 2))
  if (digits.length >= 2 && !BR_DDDS.has(ddd)) {
    return 'DDD inválido — confira os 2 primeiros dígitos'
  }
  if (digits.length < 3) return 'Agora o número começando com 9'
  if (digits[2] !== '9') {
    return 'Faltou o 9 do celular. Ex.: (11) 9 8765-4321'
  }
  if (digits.length < 11) {
    return `Faltam ${11 - digits.length} dígito${11 - digits.length > 1 ? 's' : ''}`
  }
  if (!isValidBRMobile(digits)) return 'Confira o WhatsApp — parece incorreto'
  return 'WhatsApp certo ✓ — é neste número que vamos falar com você'
}

/** E.164 BR sem +: 55 + DDD + número */
export function toWhatsAppNumber(value: string): string {
  return `55${normalizePhoneDigits(value)}`
}
