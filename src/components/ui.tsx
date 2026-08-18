import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { BRAND } from '../config'

/** Barra avança mais no começo (parece rápido) e desacelera no fim (retenção). */
export function smartProgressWidth(step: number, total: number): number {
  const t = Math.min(1, Math.max(0, step / total))
  const eased = 1 - Math.pow(1 - t, 1.55)
  return Math.round(Math.min(96, Math.max(12, eased * 100)))
}

export function progressMessage(step: number, total: number, last?: boolean): string {
  if (last || step >= total) return 'Última — seu resultado já vem aí'
  const left = total - step
  if (step <= 2) return 'Bem rápido — menos de 1 minuto'
  if (left <= 2) return 'Quase lá — falta só um pouquinho'
  if (step / total >= 0.5) return 'Já passou da metade — falta pouco'
  return 'Indo bem — continua assim'
}

export function ProgressBar({
  step,
  total,
  last,
}: {
  step: number
  total: number
  last?: boolean
}) {
  const width = smartProgressWidth(step, total)
  const message = progressMessage(step, total, last)

  return (
    <div className="w-full max-w-md mx-auto mb-2">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold mb-1.5">
        <span className="text-foreground">{message}</span>
        {!last && step < total && (
          <span className="text-muted-foreground whitespace-nowrap text-xs sm:text-sm">
            falta um pouco
          </span>
        )}
        {(last || step >= total) && (
          <span className="text-primary whitespace-nowrap text-xs sm:text-sm">final</span>
        )}
      </div>
      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full progress-brand rounded-full transition-all duration-500 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

export function TrustItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
      {icon}
      <span>{text}</span>
    </div>
  )
}

export function BrandMark() {
  return (
    <div className="flex items-center justify-center mb-6">
      <img
        src={BRAND.logoUrl}
        alt={BRAND.name}
        width={360}
        height={96}
        decoding="async"
        className="h-20 sm:h-24 w-auto max-w-[min(90vw,360px)] object-contain"
      />
    </div>
  )
}

export function OptionButton({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string
  selected?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`quiz-option flex items-center justify-center gap-3 ${selected ? 'selected' : ''}`}
    >
      {selected && <Check className="w-5 h-5 flex-shrink-0" />}
      {label}
    </button>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'success' | 'danger'
  className?: string
}) {
  const base =
    'w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3'
  const enabled =
    variant === 'success'
      ? 'bg-success text-success-foreground shadow-lg shadow-success/30 hover:brightness-110'
      : variant === 'danger'
        ? 'bg-destructive text-white shadow-lg shadow-destructive/30 hover:brightness-110'
        : 'btn-brand'
  const off = 'bg-muted text-muted-foreground cursor-not-allowed shadow-none'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${disabled ? off : enabled} ${className}`}
    >
      {children}
    </button>
  )
}

export function FieldShell({
  icon,
  children,
  topAlign,
}: {
  icon: ReactNode
  children: ReactNode
  topAlign?: boolean
}) {
  return (
    <div className="relative">
      <div
        className={`absolute left-4 text-muted-foreground pointer-events-none ${
          topAlign ? 'top-4' : 'top-1/2 -translate-y-1/2'
        }`}
      >
        {icon}
      </div>
      {children}
    </div>
  )
}

export const fieldClass =
  'w-full pl-12 pr-4 py-4 rounded-xl border-2 border-border bg-card text-foreground font-medium text-base focus:border-primary focus:outline-none transition-colors'
