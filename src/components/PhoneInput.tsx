import { Check, Phone } from 'lucide-react'
import {
  BR_DDDS,
  displayPhone,
  formatPhone,
  isValidBRMobile,
  normalizePhoneDigits,
  phoneHint,
} from '../lib/format'

type Props = {
  value: string
  onChange: (formatted: string) => void
  autoFocus?: boolean
  /** Exige confirmação visual do número antes de seguir */
  confirmed?: boolean
  onConfirmedChange?: (ok: boolean) => void
}

export function PhoneInput({
  value,
  onChange,
  autoFocus,
  confirmed = false,
  onConfirmedChange,
}: Props) {
  const digits = normalizePhoneDigits(value)
  const valid = isValidBRMobile(digits)
  const hint = phoneHint(value)
  const ddd = digits.length >= 2 ? Number(digits.slice(0, 2)) : 0
  const hasHardError =
    (digits.length >= 2 && !BR_DDDS.has(ddd)) ||
    (digits.length >= 3 && digits[2] !== '9') ||
    (digits.length === 11 && !valid)

  const handleChange = (raw: string) => {
    onConfirmedChange?.(false)
    onChange(formatPhone(raw))
  }

  return (
    <div className="w-full space-y-3">
      <div
        className={`flex items-stretch rounded-xl border-2 bg-card overflow-hidden transition-colors ${
          valid
            ? 'border-success'
            : hasHardError
              ? 'border-destructive'
              : 'border-border focus-within:border-primary'
        }`}
      >
        <div className="flex items-center gap-1.5 px-3 sm:px-4 bg-muted/80 border-r border-border text-foreground font-bold text-sm sm:text-base select-none">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <span>+55</span>
        </div>

        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="(11) 99999-9999"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus={autoFocus}
          maxLength={16}
          className="flex-1 min-w-0 px-3 sm:px-4 py-4 bg-transparent text-foreground font-medium text-base focus:outline-none tracking-wide"
          aria-label="Seu WhatsApp com DDD"
        />

        <div className="flex items-center pr-3">
          {valid ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-success text-success-foreground">
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          ) : (
            <span className="text-xs font-semibold text-muted-foreground tabular-nums w-8 text-right">
              {digits.length}/11
            </span>
          )}
        </div>
      </div>

      <p
        className={`text-center text-xs font-medium ${
          valid
            ? 'text-success'
            : hasHardError
              ? 'text-destructive'
              : 'text-muted-foreground'
        }`}
      >
        {hint}
      </p>

      {valid && (
        <div
          className={`rounded-2xl border-2 px-4 py-4 text-center transition-colors ${
            confirmed
              ? 'border-success bg-success/5'
              : 'border-[#25D366]/50 bg-[#25D366]/5'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
            Confira seu WhatsApp
          </p>
          <p className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
            {displayPhone(value)}
          </p>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            É neste número que a Alpha vai te chamar
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onConfirmedChange?.(true)}
              className={`flex-1 rounded-xl py-3 px-4 text-sm font-bold transition-colors ${
                confirmed
                  ? 'bg-success text-success-foreground'
                  : 'bg-[#25D366] text-white hover:brightness-105'
              }`}
            >
              {confirmed ? 'Número confirmado ✓' : 'Sim, este é o meu WhatsApp'}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmedChange?.(false)
                onChange('')
              }}
              className="rounded-xl py-3 px-4 text-sm font-bold border-2 border-border bg-white text-muted-foreground hover:bg-muted"
            >
              Corrigir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
