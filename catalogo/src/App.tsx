import { useEffect, useMemo, useState } from 'react'
import {
  Car,
  ChevronDown,
  MapPin,
  MessageCircle,
  Play,
  Search,
  X,
} from 'lucide-react'
import type { PublicCatalogVehicle } from '@shared/catalog'
import {
  catalogTitle,
  catalogWhatsAppMessage,
  isDirectVideo,
  videoEmbedUrl,
} from '@shared/catalog'
import {
  companyWhatsApp,
  fetchCatalogVehicles,
  formatKm,
  formatPrice,
} from './lib/api'
import { SiteFooter } from './components/SiteFooter'
import { HeroCarousel } from './components/HeroCarousel'
import { BrandLogos } from './components/BrandLogos'
import { QuickActions } from './components/QuickActions'
import { Faq } from './components/Faq'

const QUIZ_URL =
  (import.meta.env.VITE_QUIZ_URL as string | undefined) ||
  'https://alpharecupera.com.br'

function NavItem({
  href,
  label,
  external,
}: {
  href: string
  label: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex items-center gap-1 px-2.5 py-2 text-[15px] font-medium text-[#2b2b2b] hover:text-black transition-colors"
    >
      {label}
      <ChevronDown className="w-3.5 h-3.5 text-[#6b7280] stroke-[2]" />
    </a>
  )
}

function brandKey(marca: string) {
  return marca.trim().toLowerCase()
}

function waUrl(vehicle: PublicCatalogVehicle) {
  const phone = companyWhatsApp()
  if (!phone) return null
  return `https://wa.me/${phone}?text=${encodeURIComponent(
    catalogWhatsAppMessage(vehicle),
  )}`
}

function VehicleCard({
  vehicle,
  onOpen,
}: {
  vehicle: PublicCatalogVehicle
  onOpen: () => void
}) {
  const photo = vehicle.fotos[0]

  return (
    <article className="bg-white overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left group"
      >
        <div className="aspect-[16/10] bg-[#f5f5f5] relative overflow-hidden rounded-xl">
          {photo ? (
            <img
              src={photo}
              alt={catalogTitle(vehicle)}
              className="w-full h-full object-cover group-active:scale-[1.01] transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#d1d5db]">
              <Car className="w-12 h-12" />
            </div>
          )}
          {vehicle.video ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/70 text-white text-[10px] font-bold px-2 py-1">
              <Play className="w-3 h-3 fill-white" />
              Vídeo
            </span>
          ) : null}
          {vehicle.featured ? (
            <span className="absolute top-2 left-2 rounded-md bg-yellow text-ink text-[10px] font-extrabold uppercase tracking-wide px-2 py-1">
              Destaque
            </span>
          ) : null}
        </div>

        <div className="pt-3 px-0.5">
          <p className="text-[20px] font-extrabold tabular-nums tracking-tight text-ink leading-none">
            {formatPrice(vehicle.listPrice)}
          </p>
          <h2 className="mt-1.5 text-[14px] font-bold leading-snug text-[#2b2b2b] line-clamp-2">
            {catalogTitle(vehicle)}
          </h2>
          <p className="mt-1.5 text-[12px] font-medium text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {vehicle.ano ? <span>{vehicle.ano}</span> : null}
            <span>{formatKm(vehicle.quilometragem)}</span>
            {vehicle.cambio ? <span>{vehicle.cambio}</span> : null}
          </p>
          {vehicle.cidade ? (
            <p className="mt-1 text-[11px] font-medium text-muted inline-flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {vehicle.cidade}
              {vehicle.estado ? `/${vehicle.estado}` : ''}
            </p>
          ) : null}
        </div>
      </button>
    </article>
  )
}

function DetailModal({
  vehicle,
  onClose,
}: {
  vehicle: PublicCatalogVehicle
  onClose: () => void
}) {
  const wa = waUrl(vehicle)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const photos = vehicle.fotos
  const embed = vehicle.video ? videoEmbedUrl(vehicle.video) : null
  const direct = vehicle.video ? isDirectVideo(vehicle.video) : false

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={catalogTitle(vehicle)}
        className="bg-white w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-line px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <img src="/logo.png" alt="Alpha Recupera" className="h-8 w-auto" />
            <div className="min-w-0">
              <p className="font-extrabold truncate text-sm sm:text-base">
                {catalogTitle(vehicle)}
              </p>
              <p className="text-xs text-muted font-semibold">
                {vehicle.ano ? `${vehicle.ano} · ` : ''}
                {formatKm(vehicle.quilometragem)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-line flex items-center justify-center hover:bg-[#fafafa]"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="bg-white">
            <div className="aspect-[16/10] relative border-b border-line">
              {showVideo && vehicle.video ? (
                embed ? (
                  <iframe
                    title="Vídeo do veículo"
                    src={embed}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : direct ? (
                  <video
                    src={vehicle.video}
                    controls
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <a
                    href={vehicle.video}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex items-center justify-center text-sm font-bold text-yellow underline"
                  >
                    Abrir vídeo
                  </a>
                )
              ) : photos[photoIdx] ? (
                <img
                  src={photos[photoIdx]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#d1d5db]">
                  <Car className="w-20 h-20" />
                </div>
              )}
            </div>

            <div className="flex gap-2 p-3 overflow-x-auto bg-white border-b border-line lg:border-b-0">
              {photos.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  onClick={() => {
                    setShowVideo(false)
                    setPhotoIdx(i)
                  }}
                  className={`shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 ${
                    !showVideo && i === photoIdx
                      ? 'border-yellow'
                      : 'border-line'
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {vehicle.video ? (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  className={`shrink-0 w-16 h-12 rounded-md border-2 flex items-center justify-center bg-ink text-white ${
                    showVideo ? 'border-yellow' : 'border-line'
                  }`}
                >
                  <Play className="w-4 h-4 fill-white" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-[28px] font-extrabold tabular-nums tracking-tight">
                {formatPrice(vehicle.listPrice)}
              </p>
              <p className="text-xs text-muted font-semibold mt-1">
                Veículo disponível no estoque Alpha Recupera
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['Ano', vehicle.ano || '—'],
                ['Km', formatKm(vehicle.quilometragem)],
                ['Cor', vehicle.cor || '—'],
                ['Câmbio', vehicle.cambio || '—'],
                ['Combustível', vehicle.combustivel || '—'],
                [
                  'Cidade',
                  [vehicle.cidade, vehicle.estado].filter(Boolean).join('/') ||
                    '—',
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-line px-3 py-2.5"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    {label}
                  </p>
                  <p className="text-sm font-extrabold mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {vehicle.description ? (
              <p className="text-sm text-[#4b5563] font-medium leading-relaxed whitespace-pre-wrap">
                {vehicle.description}
              </p>
            ) : null}

            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl btn-zap py-3.5 text-sm"
              >
                <MessageCircle className="w-5 h-5" />
                Chamar no WhatsApp
              </a>
            ) : (
              <a
                href={QUIZ_URL}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl btn-yellow py-3.5 text-sm"
              >
                Falar com a Alpha
              </a>
            )}
            <p className="text-[11px] text-muted font-medium text-center leading-relaxed">
              A mensagem já vai pronta com o modelo, ano e preço deste carro.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [vehicles, setVehicles] = useState<PublicCatalogVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [brand, setBrand] = useState<string>('Todas')
  const [selected, setSelected] = useState<PublicCatalogVehicle | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchCatalogVehicles()
      .then((r) => {
        if (!cancelled) setVehicles(r.vehicles || [])
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (brand !== 'Todas' && brandKey(v.marca) !== brandKey(brand)) return false
      if (!term) return true
      return [v.marca, v.modelo, v.ano, v.cor, v.cidade, v.estado, v.cambio]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [vehicles, q, brand])

  const goEstoque = () => {
    document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header — mobile: logo pequena | desktop: menu completo */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#ececec]">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 h-14 md:h-[72px] flex items-center justify-between gap-4">
          <a href="/" className="shrink-0 flex items-center" aria-label="Alpha Recupera">
            <img
              src="/logo.png"
              alt="Alpha Recupera"
              className="h-8 md:h-11 w-auto object-contain"
            />
          </a>

          <nav className="hidden md:flex flex-1 items-center justify-center gap-1 lg:gap-2">
            <NavItem href="#estoque" label="Comprar" />
            <NavItem href={QUIZ_URL} label="Vender" external />
            <NavItem href="#marcas" label="Marcas" />
            <NavItem href="#faq" label="FAQ" />
            <NavItem href="#contato" label="Contato" />
          </nav>
        </div>
      </header>

      {/* Busca mobile — acima do banner (não mexe) */}
      <section className="px-4 pt-3 pb-3 md:hidden">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            goEstoque()
          }}
        >
          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#9ca3af]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Digite marca ou modelo do carro"
              className="w-full rounded-full border border-[#e5e7eb] bg-[#f7f7f8] focus:bg-white focus:border-[#d1d5db] pl-11 pr-4 py-3 text-[14px] font-medium text-[#2b2b2b] placeholder:text-[#9ca3af] focus:outline-none"
            />
          </label>
        </form>
      </section>

      {/* Banners */}
      <HeroCarousel />

      {/* Busca PC — abaixo do banner */}
      <section className="hidden md:block px-5 pt-7 pb-2">
        <form
          className="max-w-6xl mx-auto rounded-[28px] bg-white px-6 py-6 lg:px-8 lg:py-7 shadow-[0_10px_40px_rgba(17,17,17,0.06)]"
          onSubmit={(e) => {
            e.preventDefault()
            goEstoque()
          }}
        >
          <div className="flex items-center justify-between gap-4 mb-5">
            <p className="text-[22px] lg:text-[24px] font-extrabold tracking-tight text-[#2b2b2b]">
              Encontre o carro que você precisa
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2b2b2b] text-white px-4 py-2 text-[13px] font-bold shrink-0">
              <Car className="w-4 h-4" strokeWidth={2} />
              Carro
            </span>
          </div>
          <label className="relative block">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#7c3aed]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Digite marca ou modelo do carro"
              className="w-full rounded-full border border-[#c4b5fd] bg-white hover:border-[#a78bfa] focus:border-[#8b5cf6] pl-14 pr-36 py-[15px] text-[15px] font-medium text-[#2b2b2b] placeholder:text-[#9ca3af] focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full btn-yellow px-6 py-2.5 text-sm"
            >
              Buscar
            </button>
          </label>
        </form>
      </section>

      {/* Atalhos */}
      <div className="mt-5 md:mt-8">
        <QuickActions
          onBuy={goEstoque}
          onSell={QUIZ_URL}
          onReady={() => {
            setBrand('Todas')
            setQ('')
            goEstoque()
          }}
          onServices={() => {
            document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })
          }}
        />
      </div>

      {/* Marcas */}
      <div className="mt-5 md:mt-8">
        <BrandLogos
          selected={brand}
          onSelect={(b) => {
            setBrand(b)
            goEstoque()
          }}
        />
      </div>

      {/* Catálogo */}
      <main
        id="estoque"
        className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-5 pt-6 pb-10 md:py-10"
      >
        <div className="mb-4 md:mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-2xl font-extrabold tracking-tight">
              {brand === 'Todas' ? 'Carros à venda' : `Carros ${brand}`}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted font-medium">
              {loading
                ? 'Carregando…'
                : `${filtered.length} veículo${filtered.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold mb-6">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[16/10] bg-[#f0f0f0] rounded-xl" />
                <div className="mt-3 space-y-2">
                  <div className="h-4 bg-[#f0f0f0] rounded w-1/2" />
                  <div className="h-3 bg-[#f0f0f0] rounded w-3/4" />
                  <div className="h-3 bg-[#f0f0f0] rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white py-14 px-6 text-center">
            <img src="/logo.png" alt="" className="h-10 mx-auto mb-4 opacity-80" />
            <p className="text-base font-extrabold">
              {brand === 'Todas'
                ? 'Nenhum carro no momento'
                : `Nenhum ${brand} disponível agora`}
            </p>
            <p className="text-sm text-muted font-medium mt-2 max-w-sm mx-auto">
              Assim que entrarem veículos no estoque, eles aparecem aqui.
            </p>
            {brand !== 'Todas' || q ? (
              <button
                type="button"
                onClick={() => {
                  setBrand('Todas')
                  setQ('')
                }}
                className="inline-flex mt-5 rounded-full btn-yellow px-5 py-2.5 text-sm"
              >
                Ver todos
              </button>
            ) : (
              <a
                href={QUIZ_URL}
                className="inline-flex mt-5 rounded-full btn-yellow px-5 py-2.5 text-sm"
              >
                Avaliar meu carro
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-6 md:gap-x-5 md:gap-y-8">
            {filtered.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                onOpen={() => setSelected(v)}
              />
            ))}
          </div>
        )}
      </main>

      <Faq />
      <SiteFooter />

      {selected ? (
        <DetailModal vehicle={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}
