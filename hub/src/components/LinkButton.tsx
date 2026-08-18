import { Car, ChevronRight, HandCoins, ShoppingBag } from 'lucide-react'
import type { HubIcon, HubLink } from '../data/hub'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function LinkIcon({ icon }: { icon: HubIcon }) {
  const className = 'w-[18px] h-[18px]'
  switch (icon) {
    case 'whatsapp':
      return <WhatsAppIcon className={className} />
    case 'sell':
      return <HandCoins className={className} strokeWidth={2.1} />
    case 'buy':
      return <ShoppingBag className={className} strokeWidth={2.1} />
    case 'catalog':
      return <Car className={className} strokeWidth={2.1} />
  }
}

export function LinkButton({ link, index }: { link: HubLink; index: number }) {
  const zap = link.accent === 'zap'

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      className="fade-up group flex items-center gap-3 w-full rounded-2xl bg-white text-[#111] px-3.5 py-[15px] transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985]"
      style={{ animationDelay: `${70 + index * 50}ms` }}
    >
      <span
        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          zap ? 'bg-[#25d366] text-white' : 'bg-[#f3f3f3] text-[#111]'
        }`}
      >
        <LinkIcon icon={link.icon} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[14px] sm:text-[15px] font-semibold leading-snug tracking-[-0.01em]">
          {link.title}
        </span>
        {link.subtitle ? (
          <span className="block text-[12px] font-medium text-[#8a8a8a] mt-0.5">
            {link.subtitle}
          </span>
        ) : null}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-[#b0b0b0] group-hover:text-[#111] transition-colors" />
    </a>
  )
}
