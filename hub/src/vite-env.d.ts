/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WHATSAPP_NUMBER?: string
  readonly VITE_WHATSAPP_ENZO?: string
  readonly VITE_WHATSAPP_JOAO?: string
  readonly VITE_QUIZ_URL?: string
  readonly VITE_CATALOG_URL?: string
  readonly VITE_INSTAGRAM_URL?: string
  readonly VITE_YOUTUBE_URL?: string
  readonly VITE_FACEBOOK_URL?: string
  readonly VITE_PROMO_GROUP_URL?: string
  readonly VITE_PROMO_GROUP_LABEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
