/**
 * Dados institucionais do rodapé.
 * Preencha via .env (VITE_*) ou edite os fallbacks abaixo.
 */
export const COMPANY = {
  tradeName: 'Alpha Recupera',
  legalName:
    (import.meta.env.VITE_COMPANY_LEGAL_NAME as string | undefined)?.trim() ||
    'Alpha Recupera',
  cnpj:
    (import.meta.env.VITE_COMPANY_CNPJ as string | undefined)?.trim() || '',
  /** Endereço completo — você vai mandar a localização certa */
  address:
    (import.meta.env.VITE_COMPANY_ADDRESS as string | undefined)?.trim() || '',
  city:
    (import.meta.env.VITE_COMPANY_CITY as string | undefined)?.trim() || '',
  state:
    (import.meta.env.VITE_COMPANY_STATE as string | undefined)?.trim() || '',
  email:
    (import.meta.env.VITE_COMPANY_EMAIL as string | undefined)?.trim() ||
    'contato@alpharecupera.com.br',
  site:
    (import.meta.env.VITE_QUIZ_URL as string | undefined)?.trim() ||
    'https://alpharecupera.com.br',
  /** Link do grupo de promoções (WhatsApp Community / grupo) */
  promoGroupUrl:
    (import.meta.env.VITE_PROMO_GROUP_URL as string | undefined)?.trim() || '',
  promoGroupLabel:
    (import.meta.env.VITE_PROMO_GROUP_LABEL as string | undefined)?.trim() ||
    'Grupo de promoções',
  instagramUrl:
    (import.meta.env.VITE_INSTAGRAM_URL as string | undefined)?.trim() || '',
  facebookUrl:
    (import.meta.env.VITE_FACEBOOK_URL as string | undefined)?.trim() || '',
}

export function formatCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return d.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  )
}

export function companyLocationLine() {
  const parts = [COMPANY.address, COMPANY.city, COMPANY.state].filter(Boolean)
  return parts.join(' · ')
}
