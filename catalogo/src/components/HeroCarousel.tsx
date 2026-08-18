import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const SLIDES = [
  {
    src: '/banners/banner-1.png',
    alt: 'Alpha Recupera — compre seu próximo carro',
  },
  {
    src: '/banners/banner-2.png',
    alt: 'Alpha Recupera — veículos selecionados',
  },
  {
    src: '/banners/banner-3.png',
    alt: 'Seu carro. Suas condições. — Fale com a Alpha',
  },
  {
    src: '/banners/banner-4.png',
    alt: 'Compre seu próximo carro — veículos a partir de 2015',
  },
  {
    src: '/banners/banner-5.png',
    alt: 'Alpha Recupera — catálogo de veículos',
  },
  {
    src: '/banners/banner-6.png',
    alt: 'Alpha Recupera — ofertas e condições',
  },
  {
    src: '/banners/banner-7.png',
    alt: 'Alpha Recupera — encontre o seu carro',
  },
]

export function HeroCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length)
    }, 5500)
    return () => window.clearInterval(t)
  }, [])

  const prev = () => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)
  const next = () => setIndex((i) => (i + 1) % SLIDES.length)

  return (
    <section className="relative w-full bg-white">
      <div className="relative w-full overflow-hidden h-[152px] sm:h-[188px] md:h-[240px] lg:h-[280px] xl:h-[320px]">
        {SLIDES.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
            alt={s.alt}
            className={`absolute inset-0 w-full h-full object-cover object-center select-none transition-opacity duration-500 ${
              i === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            width={2146}
            height={320}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={i === 0 ? 'high' : 'low'}
            draggable={false}
          />
        ))}

        <button
          type="button"
          onClick={prev}
          className="absolute left-2 sm:left-3 md:left-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#5c5c5c]/55 hover:bg-[#5c5c5c]/80 flex items-center justify-center transition-colors"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-2 sm:right-3 md:right-4 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#5c5c5c]/55 hover:bg-[#5c5c5c]/80 flex items-center justify-center transition-colors"
          aria-label="Próximo"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" strokeWidth={2.25} />
        </button>

        <div className="absolute bottom-2 sm:bottom-2.5 left-0 right-0 z-10 flex justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/55'
              }`}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
