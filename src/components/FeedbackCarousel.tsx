import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import { FEEDBACKS } from '../data/feedbacks'

function FeedbackPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#fff4e8] to-[#ffe0b8] text-[#cc4a00]">
        <ImageIcon className="w-8 h-8 opacity-70" />
        <span className="text-[11px] font-semibold opacity-80">Foto em breve</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function FeedbackCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const pauseRef = useRef(false)

  const scrollTo = (i: number) => {
    const el = scrollerRef.current
    if (!el) return
    const next = ((i % FEEDBACKS.length) + FEEDBACKS.length) % FEEDBACKS.length
    const card = el.children[next] as HTMLElement | undefined
    if (!card) return
    el.scrollTo({ left: card.offsetLeft - 8, behavior: 'smooth' })
    setIndex(next)
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const onScroll = () => {
      const cards = Array.from(el.children) as HTMLElement[]
      if (!cards.length) return
      const mid = el.scrollLeft + el.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      cards.forEach((card, i) => {
        const center = card.offsetLeft + card.offsetWidth / 2
        const dist = Math.abs(center - mid)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      setIndex(best)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pauseRef.current) return
      scrollTo(index + 1)
    }, 4200)
    return () => window.clearInterval(id)
  }, [index])

  return (
    <section
      className="mt-8"
      aria-label="Compras feitas essa semana"
      onMouseEnter={() => {
        pauseRef.current = true
      }}
      onMouseLeave={() => {
        pauseRef.current = false
      }}
      onTouchStart={() => {
        pauseRef.current = true
      }}
      onTouchEnd={() => {
        window.setTimeout(() => {
          pauseRef.current = false
        }, 5000)
      }}
    >
      <div className="text-center mb-4">
        <p className="text-sm font-extrabold text-foreground">
          Compras feitas essa semana
        </p>
        <p className="text-xs text-muted-foreground font-medium mt-1">
          Pessoas que confiaram na Alpha e tiveram seu problema resolvido
        </p>
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {FEEDBACKS.map((item) => (
            <article
              key={item.id}
              className="snap-center shrink-0 w-[82%] max-w-[280px] rounded-2xl border border-border bg-white overflow-hidden shadow-[0_8px_24px_rgba(255,106,0,0.08)]"
            >
              <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                <FeedbackPhoto
                  src={item.image}
                  alt={`${item.name} — ${item.car}`}
                />
              </div>
              <div className="p-3.5 text-left">
                <p className="text-[13px] leading-snug text-foreground font-medium">
                  “{item.quote}”
                </p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground font-medium truncate">
                      {item.city}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary bg-secondary px-2 py-1 rounded-md">
                    {item.car}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          aria-label="Anterior"
          onClick={() => scrollTo(index - 1)}
          className="absolute left-0 top-[38%] -translate-y-1/2 -translate-x-1 w-8 h-8 rounded-full bg-white/95 border border-border shadow-sm flex items-center justify-center text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Próximo"
          onClick={() => scrollTo(index + 1)}
          className="absolute right-0 top-[38%] -translate-y-1/2 translate-x-1 w-8 h-8 rounded-full bg-white/95 border border-border shadow-sm flex items-center justify-center text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-3">
        {FEEDBACKS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-label={`Ir para depoimento ${i + 1}`}
            onClick={() => scrollTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border'
            }`}
          />
        ))}
      </div>
    </section>
  )
}
