import { useEffect, useMemo, useState } from 'react'
import { Car } from 'lucide-react'

const BRANDS: { name: string; logo: string }[] = [
  { name: 'Volkswagen', logo: '/brands/volkswagen.png' },
  { name: 'Chevrolet', logo: '/brands/chevrolet.png' },
  { name: 'Fiat', logo: '/brands/fiat.png' },
  { name: 'Toyota', logo: '/brands/toyota.png' },
  { name: 'Honda', logo: '/brands/honda.png' },
  { name: 'Hyundai', logo: '/brands/hyundai.png' },
  { name: 'Jeep', logo: '/brands/jeep.png' },
  { name: 'Ford', logo: '/brands/ford.png' },
  { name: 'Renault', logo: '/brands/renault.png' },
  { name: 'Nissan', logo: '/brands/nissan.png' },
  { name: 'BYD', logo: '/brands/byd.png' },
  { name: 'Chery', logo: '/brands/chery.png' },
  { name: 'Peugeot', logo: '/brands/peugeot.png' },
  { name: 'Citroën', logo: '/brands/citroen.png' },
  { name: 'Mitsubishi', logo: '/brands/mitsubishi.png' },
  { name: 'BMW', logo: '/brands/bmw.png' },
  { name: 'Mercedes-Benz', logo: '/brands/mercedes.png' },
  { name: 'Audi', logo: '/brands/audi.png' },
]

const PER_PAGE = 8

export function BrandLogos({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (brand: string) => void
}) {
  const [page, setPage] = useState(0)
  const [paused, setPaused] = useState(false)
  const key = selected.trim().toLowerCase()
  const pages = Math.ceil(BRANDS.length / PER_PAGE)

  const chunks = useMemo(() => {
    const out: (typeof BRANDS)[] = []
    for (let i = 0; i < BRANDS.length; i += PER_PAGE) {
      out.push(BRANDS.slice(i, i + PER_PAGE))
    }
    return out
  }, [])

  useEffect(() => {
    if (pages <= 1 || paused) return
    const t = window.setInterval(() => {
      setPage((p) => (p + 1) % pages)
    }, 4000)
    return () => window.clearInterval(t)
  }, [pages, paused])

  return (
    <section id="marcas" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8 sm:mb-10">
          <h2 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight text-[#2b2b2b]">
            Confira as marcas
          </h2>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2b2b2b] text-white px-4 py-2 text-[13px] font-bold"
            >
              <Car className="w-4 h-4" strokeWidth={2} />
              Carro
            </button>
            <button
              type="button"
              onClick={() => onSelect('Todas')}
              className={`rounded-full px-4 py-2 text-[13px] font-bold border ${
                key === 'todas' || !selected
                  ? 'border-[#2b2b2b] text-[#2b2b2b]'
                  : 'border-[#d1d5db] text-[#6b7280]'
              }`}
            >
              Todas
            </button>
          </div>
        </div>

        <div
          className="overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {chunks.map((chunk, pageIdx) => (
              <div
                key={pageIdx}
                className="w-full shrink-0 grid grid-cols-4 lg:grid-cols-8 gap-x-3 sm:gap-x-5 lg:gap-x-6 gap-y-8 justify-items-center"
              >
                {chunk.map((b) => {
                  const active = key === b.name.toLowerCase()
                  return (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => onSelect(active ? 'Todas' : b.name)}
                      className="w-full flex flex-col items-center gap-3"
                      aria-pressed={active}
                    >
                      <span
                        className={`w-full max-w-[132px] aspect-square rounded-full bg-white flex items-center justify-center p-[18%] border ${
                          active
                            ? 'border-[#2b2b2b]'
                            : 'border-[#e6e6e6] hover:border-[#cfcfcf]'
                        }`}
                      >
                        <img
                          src={b.logo}
                          alt={b.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      </span>
                      <span
                        className={`text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.04em] text-center leading-tight px-0.5 ${
                          active ? 'text-[#1a1a1a]' : 'text-[#4b5563]'
                        }`}
                      >
                        {b.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {pages > 1 ? (
          <div className="flex justify-center items-center gap-2 mt-8 sm:mt-10">
            {Array.from({ length: pages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-label={`Página ${i + 1}`}
                className={`h-[3px] rounded-full transition-all ${
                  i === page ? 'w-8 bg-[#e10600]' : 'w-6 bg-[#d1d5db]'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
