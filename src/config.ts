function envWhatsAppNumbers(): string[] {
  const raw =
    (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) ||
    (import.meta.env.VITE_WHATSAPP_NUMBERS as string | undefined) ||
    ''
  return raw
    .split(/[,\s]+/)
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 12)
}

export const BRAND = {
  name: 'AlphaRecupera',
  shortName: 'Alpha',
  logoUrl: '/logo.png',
}

/**
 * Números de WhatsApp da empresa (DDI 55 + DDD + celular).
 * Prefira VITE_WHATSAPP_NUMBER no .env — ex.: 5511987654321
 */
export const WHATSAPP_NUMBERS = (() => {
  const fromEnv = envWhatsAppNumbers()
  if (fromEnv.length) return fromEnv
  // Fallback: troque ou defina VITE_WHATSAPP_NUMBER no deploy
  return ['5511999999999']
})()
