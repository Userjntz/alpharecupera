export const QUIZ_URL =
  (import.meta.env.VITE_QUIZ_URL as string | undefined)?.trim() ||
  'https://alpharecupera.com.br'

export const CATALOG_URL =
  (import.meta.env.VITE_CATALOG_URL as string | undefined)?.trim() ||
  'https://catalogo.alpharecupera.com.br'

export const INSTAGRAM_URL =
  (import.meta.env.VITE_INSTAGRAM_URL as string | undefined)?.trim() ||
  'https://www.instagram.com/alpharecupera/'

export const YOUTUBE_URL =
  (import.meta.env.VITE_YOUTUBE_URL as string | undefined)?.trim() ||
  'https://www.youtube.com/@alpharecupera'

export const FACEBOOK_URL =
  (import.meta.env.VITE_FACEBOOK_URL as string | undefined)?.trim() || ''

function envDigits(raw: string | undefined): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits || digits.length < 12 || digits.includes('999999999')) return ''
  return digits
}

export const WHATSAPP_ENZO = envDigits(import.meta.env.VITE_WHATSAPP_ENZO)
export const WHATSAPP_JOAO = envDigits(import.meta.env.VITE_WHATSAPP_JOAO)

export function waUrl(phone: string, message: string) {
  const text = encodeURIComponent(message)
  if (!phone) return `https://wa.me/?text=${text}`
  return `https://wa.me/${phone}?text=${text}`
}

export const PROFILE = {
  name: 'Alpha Recupera',
  handle: 'hub.alpharecupera.com.br',
  bio: 'Compre, venda e fale com a gente em um clique.',
}

export const MESSAGES = {
  vender:
    'Olá! Quero vender meu carro com parcelas atrasadas.',
  comprar: 'Olá! Quero comprar um carro.',
  enzo: 'Olá Enzo! Vim pelo hub da Alpha Recupera.',
  joao: 'Olá João! Vim pelo hub da Alpha Recupera.',
  geral: 'Olá! Vim pelo hub da Alpha Recupera.',
}

export type HubIcon = 'sell' | 'buy' | 'whatsapp' | 'catalog'

export type HubLink = {
  id: string
  title: string
  subtitle?: string
  href: string
  icon: HubIcon
  accent?: 'zap'
}

export type HubBanner = {
  id: string
  src: string
  alt: string
  href: string
}

export const BANNERS: HubBanner[] = [
  {
    id: 'b1',
    src: '/banners/banner-1.webp',
    alt: 'Alpha Recupera — compre seu próximo carro',
    href: CATALOG_URL,
  },
  {
    id: 'b2',
    src: '/banners/banner-2.webp',
    alt: 'Veículos selecionados na Alpha Recupera',
    href: CATALOG_URL,
  },
  {
    id: 'b3',
    src: '/banners/banner-3.webp',
    alt: 'Fale com a Alpha Recupera',
    href: QUIZ_URL,
  },
  {
    id: 'b4',
    src: '/banners/banner-4.webp',
    alt: 'Carros a partir de 2015',
    href: CATALOG_URL,
  },
  {
    id: 'b5',
    src: '/banners/banner-5.webp',
    alt: 'Catálogo de veículos Alpha Recupera',
    href: CATALOG_URL,
  },
  {
    id: 'b6',
    src: '/banners/banner-6.webp',
    alt: 'Ofertas e condições Alpha Recupera',
    href: CATALOG_URL,
  },
]

export function hubLinks(): HubLink[] {
  const enzo = waUrl(WHATSAPP_ENZO, MESSAGES.enzo)
  const joao = waUrl(WHATSAPP_JOAO, MESSAGES.joao)

  const links: HubLink[] = [
    {
      id: 'vender',
      title: 'Quero vender meu carro com parcelas atrasadas',
      href: QUIZ_URL,
      icon: 'sell',
    },
    {
      id: 'comprar',
      title: 'Quero comprar um carro',
      href: CATALOG_URL,
      icon: 'buy',
    },
    {
      id: 'enzo',
      title: 'Conversar com Enzo',
      subtitle: 'WhatsApp',
      href: enzo,
      icon: 'whatsapp',
      accent: 'zap',
    },
    {
      id: 'joao',
      title: 'Conversar com João',
      subtitle: 'WhatsApp',
      href: joao,
      icon: 'whatsapp',
      accent: 'zap',
    },
    {
      id: 'catalogo',
      title: 'Catálogo completo dos veículos',
      href: CATALOG_URL,
      icon: 'catalog',
    },
  ]

  return links.filter((link) => Boolean(link.href))
}

export function socialWhatsAppUrl() {
  const phone = WHATSAPP_ENZO || WHATSAPP_JOAO
  return waUrl(phone, MESSAGES.geral)
}
