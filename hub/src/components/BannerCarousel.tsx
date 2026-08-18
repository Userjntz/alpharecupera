import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BANNERS } from '../data/hub'

export function BannerCarousel() {
  const [index, setIndex] = useState(0)
  const slides = BANNERS

  useEffect(() => {
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, 5000)
    return () => window.clearInterval(t)
  }, [slides.length])

  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length)
  const next = () => setIndex((i) => (i + 1) % slides.length)

  return (
    <section className="relative">
      <div className="relative overflow-hidden rounded-[20px] bg-card">
        {slides.map((s, i) => (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className={`block ${
              i === index
                ? 'relative opacity-100'
                : 'absolute inset-0 opacity-0 pointer-events-none'
            } transition-opacity duration-500`}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
          >
            <img
              src={s.src}
              alt={s.alt}
              className="block w-full h-auto select-none"
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
          </a>
        ))}

        <button
          type="button"
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white"
          aria-label="Banner anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/55 border border-white/15 flex items-center justify-center text-white"
          aria-label="Próximo banner"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="absolute bottom-2.5 left-0 right-0 z-10 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-5 bg-gold' : 'w-1.5 bg-white/50'
              }`}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
