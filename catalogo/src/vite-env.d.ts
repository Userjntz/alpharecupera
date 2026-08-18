/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEADS_API_URL?: string
  readonly VITE_QUIZ_URL?: string
  readonly VITE_WHATSAPP_NUMBER?: string
  readonly VITE_COMPANY_LEGAL_NAME?: string
  readonly VITE_COMPANY_CNPJ?: string
  readonly VITE_COMPANY_ADDRESS?: string
  readonly VITE_COMPANY_CITY?: string
  readonly VITE_COMPANY_STATE?: string
  readonly VITE_COMPANY_EMAIL?: string
  readonly VITE_PROMO_GROUP_URL?: string
  readonly VITE_PROMO_GROUP_LABEL?: string
  readonly VITE_INSTAGRAM_URL?: string
  readonly VITE_FACEBOOK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
