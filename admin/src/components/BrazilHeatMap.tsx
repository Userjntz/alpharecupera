import { useMemo, useState } from 'react'
import { BRAZIL_PATHS, BRAZIL_VIEWBOX } from '../data/brazilPaths'
import { UF_NAMES } from '../lib/ddd'

type Props = {
  counts: Record<string, number>
}

function heatColor(value: number, max: number): string {
  if (!value || max <= 0) return '#f3f0eb'
  const t = Math.min(1, value / max)
  // gradiente logo: #ffb732 → #ff8a00 → #ff6a00 → #e84d00
  if (t < 0.25) return '#ffe2a8'
  if (t < 0.45) return '#ffc14d'
  if (t < 0.65) return '#ff9a1a'
  if (t < 0.85) return '#ff6a00'
  return '#e24a00'
}

export function BrazilHeatMap({ counts }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const max = useMemo(
    () => Math.max(0, ...Object.values(counts)),
    [counts],
  )
  const total = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts],
  )
  const active = hover && counts[hover] ? hover : null

  return (
    <div className="relative h-full flex flex-col">
      <svg
        viewBox={BRAZIL_VIEWBOX}
        className="w-full flex-1 min-h-[280px] max-h-[420px]"
        role="img"
        aria-label="Mapa de calor de leads por estado"
      >
        {Object.entries(BRAZIL_PATHS).map(([uf, d]) => {
          const value = counts[uf] || 0
          const selected = active === uf
          return (
            <path
              key={uf}
              d={d}
              fill={heatColor(value, max)}
              stroke={selected ? '#ff6a00' : '#ffffff'}
              strokeWidth={selected ? 2.2 : 0.9}
              className="transition-colors duration-200 cursor-pointer"
              onMouseEnter={() => setHover(uf)}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {UF_NAMES[uf] || uf}: {value} lead{value === 1 ? '' : 's'}
              </title>
            </path>
          )
        })}
      </svg>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted font-semibold">Menos</span>
          <span className="h-2.5 w-8 rounded-full bg-[#f3f0eb] border border-line" />
          <span className="h-2.5 w-8 rounded-full bg-[#ffc14d]" />
          <span className="h-2.5 w-8 rounded-full bg-[#ff6a00]" />
          <span className="h-2.5 w-8 rounded-full bg-[#e24a00]" />
          <span className="text-muted font-semibold">Mais</span>
        </div>
        <span className="font-bold text-brand">
          {active
            ? `${active} · ${counts[active] || 0}`
            : `${total} no mapa`}
        </span>
      </div>
    </div>
  )
}
