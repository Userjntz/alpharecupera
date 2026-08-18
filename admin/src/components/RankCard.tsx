import type { RankItem } from '../lib/stats'

export function RankCard({
  title,
  items,
  empty = 'Sem dados ainda',
}: {
  title: string
  items: RankItem[]
  empty?: string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))

  return (
    <article className="rounded-2xl bg-white border border-line p-5 shadow-[0_8px_24px_rgba(255,106,0,0.05)] h-full">
      <h3 className="text-sm font-extrabold text-ink mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted font-medium">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.label}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-[#374151] truncate">
                  {item.label}
                </span>
                <span className="text-xs font-bold text-brand shrink-0">
                  {item.pct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#f3f0eb] overflow-hidden">
                <div
                  className="h-full rounded-full bar-brand transition-all duration-500"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
