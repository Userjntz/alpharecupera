import { Car, HandCoins, ShoppingBag, Wrench } from 'lucide-react'

type Action = {
  id: string
  label: string
  icon: typeof Car
  onClick?: () => void
  href?: string
}

export function QuickActions({
  onBuy,
  onSell,
  onReady,
  onServices,
}: {
  onBuy: () => void
  onSell: string
  onReady: () => void
  onServices: () => void
}) {
  const actions: Action[] = [
    {
      id: 'vender',
      label: 'Quero vender',
      icon: HandCoins,
      href: onSell,
    },
    {
      id: 'comprar',
      label: 'Quero comprar',
      icon: ShoppingBag,
      onClick: onBuy,
    },
    {
      id: 'rodar',
      label: 'Carros só para rodar',
      icon: Car,
      onClick: onReady,
    },
    {
      id: 'servicos',
      label: 'Serviços',
      icon: Wrench,
      onClick: onServices,
    },
  ]

  return (
    <section className="px-4 md:px-5">
      <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 -mx-0.5 px-0.5 md:grid md:grid-cols-4 md:overflow-visible md:max-w-6xl md:mx-auto">
        {actions.map((a) => {
          const Icon = a.icon
          const className =
            'shrink-0 w-[104px] md:w-auto flex flex-col items-center gap-2.5 text-center group'
          const inner = (
            <>
              <span className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#f3f4f6] flex items-center justify-center group-active:bg-[#ececec] transition-colors">
                <Icon className="w-6 h-6 md:w-7 md:h-7 text-[#2b2b2b] stroke-[1.75]" />
              </span>
              <span className="text-[12px] md:text-[13px] font-semibold text-[#2b2b2b] leading-tight px-1">
                {a.label}
              </span>
            </>
          )

          if (a.href) {
            return (
              <a
                key={a.id}
                href={a.href}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {inner}
              </a>
            )
          }

          return (
            <button
              key={a.id}
              type="button"
              onClick={a.onClick}
              className={className}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </section>
  )
}
