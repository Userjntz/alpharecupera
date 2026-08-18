import type { ReactNode } from 'react'
import { ArrowUp, Facebook, Instagram } from 'lucide-react'
import {
  COMPANY,
  companyLocationLine,
  formatCnpj,
} from '../lib/company'
import { companyWhatsApp } from '../lib/api'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function Col({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="text-[15px] font-extrabold text-[#2b2b2b] mb-4">{title}</p>
      <ul className="space-y-2.5 text-[14px] font-medium text-[#4b5563]">
        {children}
      </ul>
    </div>
  )
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string
  children: ReactNode
  external?: boolean
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        className="hover:text-[#1a1a1a] transition-colors"
      >
        {children}
      </a>
    </li>
  )
}

export function SiteFooter() {
  const location = companyLocationLine()
  const cnpj = COMPANY.cnpj ? formatCnpj(COMPANY.cnpj) : ''
  const wa = companyWhatsApp()
  const waUrl = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        'Olá! Vim pelo catálogo da Alpha Recupera e quero atendimento.',
      )}`
    : ''

  return (
    <footer id="contato" className="mt-auto bg-white border-t border-[#ececec] text-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 pt-8 pb-10">
        <div className="flex items-center justify-between gap-4 pb-8">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt={COMPANY.tradeName}
              className="h-10 sm:h-11 w-auto object-contain"
            />
            {COMPANY.legalName && COMPANY.legalName !== COMPANY.tradeName ? (
              <p className="hidden sm:block text-[11px] text-[#9ca3af] font-medium truncate">
                {COMPANY.legalName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#4b5563] hover:text-[#1a1a1a]"
          >
            Topo
            <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-10">
          <Col title="Comprar">
            <FooterLink href="#estoque">Carros à venda</FooterLink>
            <FooterLink href="#marcas">Buscar por marca</FooterLink>
            <FooterLink href="#estoque">Ver ofertas</FooterLink>
            <FooterLink href="#faq">Dúvidas para comprar</FooterLink>
          </Col>

          <Col title="Vender">
            <FooterLink href={COMPANY.site} external>
              Avaliar meu carro
            </FooterLink>
            <FooterLink href={COMPANY.site} external>
              Quiz de análise
            </FooterLink>
            <FooterLink href="#faq">Carro financiado</FooterLink>
            <FooterLink href="#faq">Parcelas atrasadas</FooterLink>
          </Col>

          <Col title="Ajuda">
            <FooterLink href="#faq">Perguntas frequentes</FooterLink>
            <FooterLink href="#faq">Documentação</FooterLink>
            <FooterLink href="#faq">Como funciona</FooterLink>
            {waUrl ? (
              <FooterLink href={waUrl} external>
                Falar no WhatsApp
              </FooterLink>
            ) : (
              <FooterLink href={`mailto:${COMPANY.email}`}>
                Falar por e-mail
              </FooterLink>
            )}
          </Col>

          <Col title="Empresa">
            <FooterLink href="#contato">Quem somos</FooterLink>
            <FooterLink href="#contato">Contato</FooterLink>
            <FooterLink href={COMPANY.site} external>
              Site oficial
            </FooterLink>
            {COMPANY.promoGroupUrl ? (
              <FooterLink href={COMPANY.promoGroupUrl} external>
                Grupo de promoções
              </FooterLink>
            ) : null}
          </Col>

          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <p className="text-[15px] font-extrabold text-[#2b2b2b] mb-4">
              Contato
            </p>
            <ul className="space-y-2.5 text-[14px] font-medium text-[#4b5563]">
              {cnpj ? <li>CNPJ {cnpj}</li> : null}
              {location ? <li>{location}</li> : null}
              <li>
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="hover:text-[#1a1a1a] break-all"
                >
                  {COMPANY.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#ececec] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#2b2b2b] hover:border-[#2b2b2b]"
                aria-label="WhatsApp"
              >
                <WhatsAppIcon className="w-4 h-4" />
              </a>
            ) : null}
            {COMPANY.instagramUrl ? (
              <a
                href={COMPANY.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#2b2b2b] hover:border-[#2b2b2b]"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
            ) : null}
            {COMPANY.facebookUrl ? (
              <a
                href={COMPANY.facebookUrl}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full border border-[#e5e7eb] flex items-center justify-center text-[#2b2b2b] hover:border-[#2b2b2b]"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-[#9ca3af]">
            <a href="#faq" className="hover:text-[#4b5563]">
              FAQ
            </a>
            <a href="#contato" className="hover:text-[#4b5563]">
              Contato
            </a>
            <a href="#estoque" className="hover:text-[#4b5563]">
              Catálogo
            </a>
            <a href={COMPANY.site} className="hover:text-[#4b5563]">
              Avaliar meu carro
            </a>
          </div>
        </div>

        <p className="mt-6 text-[12px] font-medium text-[#9ca3af]">
          © {new Date().getFullYear()} {COMPANY.tradeName}
          {cnpj ? ` • CNPJ ${cnpj}` : ''} • Todos os direitos reservados
          <span className="hidden sm:inline">
            {' '}
            • Preços e disponibilidade sujeitos a confirmação
          </span>
        </p>
      </div>
    </footer>
  )
}
