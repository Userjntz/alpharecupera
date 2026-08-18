import { useEffect, useState } from 'react'
import {
  Building2,
  Car,
  CheckCircle2,
  Copy,
  Gauge,
  Loader2,
  MapPin,
  Phone,
  User,
  X,
} from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import { formatKm, formatPhone, timeAgo } from '../lib/format'
import { updateLead } from '../lib/api'
import {
  evaluateStoredLead,
  qualityBadgeClass,
  qualityLabel,
} from '@shared/leadQuality'

function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function firstName(fullName: string | undefined) {
  return fullName?.trim().split(/\s+/)[0] || ''
}

function carLabel(lead: LeadRecord) {
  return [lead.marca, lead.modelo, lead.ano].filter(Boolean).join(' ').trim() || 'seu carro'
}

function whatsappUrl(lead: LeadRecord, captadorName?: string) {
  const phone = whatsappDigits(lead.telefone)
  if (!phone) return null
  const captador = firstName(captadorName)
  const who = captador
    ? `Sou ${captador}, da Alpha Recupera`
    : 'Sou da Alpha Recupera'
  const text = `Oi! Tudo bem? ${who}. Temos interesse em comprar seu ${carLabel(lead)} agora mesmo — você tem 1 minutinho?`
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl bg-soft/80 border border-line px-3.5 py-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">
        {label}
      </p>
      <p
        className={`text-sm font-bold text-ink break-words ${
          mono ? 'tabular-nums tracking-wide' : ''
        }`}
      >
        {value || '—'}
      </p>
    </div>
  )
}

function moneyOrText(value: string) {
  if (!value?.trim()) return '—'
  const digits = value.replace(/\D/g, '')
  if (!digits || digits.length < 2) return value
  const n = Number(digits)
  if (Number.isNaN(n) || n <= 0) return value
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function LeadDetailModal({
  lead,
  captadorName,
  onClose,
  onUpdated,
  showFinalize = true,
}: {
  lead: LeadRecord
  captadorName?: string
  onClose: () => void
  onUpdated?: (lead: LeadRecord) => void
  showFinalize?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [contactedLocal, setContactedLocal] = useState(false)
  const [copied, setCopied] = useState(false)

  const title = `${lead.marca} ${lead.modelo}`.trim() || 'Veículo'
  const wa = whatsappUrl(lead, captadorName)
  const finalized = lead.status === 'finalizado'
  const grade = evaluateStoredLead(lead)
  const gradeLabel = qualityLabel(grade.quality)
  const gradeClass = qualityBadgeClass(grade.quality)
  const contacted = Boolean(lead.contacted_at) || contactedLocal
  const phoneDisplay = formatPhone(lead.telefone)

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

  const markContacted = async () => {
    setContactedLocal(true)
    if (lead.contacted_at || finalized) return
    try {
      const updated = await updateLead(lead.id, {
        contacted_at: new Date().toISOString(),
      })
      onUpdated?.(updated)
    } catch {
      /* UI local */
    }
  }

  const markFinalized = async () => {
    if (busy || finalized) return
    setBusy(true)
    try {
      const updated = await updateLead(lead.id, {
        status: 'finalizado',
        finalized_at: new Date().toISOString(),
        contacted_at: lead.contacted_at || new Date().toISOString(),
      })
      onUpdated?.(updated)
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phoneDisplay)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cliente ${lead.nome || title}`}
        className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-line px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                  finalized ? 'bg-zinc-100 text-muted' : gradeClass
                }`}
              >
                {finalized ? 'Finalizado' : gradeLabel}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-brand">
                score {grade.score} · {timeAgo(lead.created_at)}
              </span>
            </div>
            <h2 className="text-xl font-extrabold leading-tight truncate">
              {lead.nome || 'Sem nome'}
            </h2>
            <p className="text-sm text-muted font-semibold mt-0.5 truncate">
              {title}
              {lead.ano ? ` · ${lead.ano}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-xl border border-line bg-soft flex items-center justify-center text-muted hover:text-ink hover:bg-white transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Contato
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Nome" value={lead.nome} />
              <div className="rounded-xl bg-soft/80 border border-line px-3.5 py-3 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">
                  WhatsApp
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-ink tabular-nums tracking-wide">
                    {phoneDisplay || '—'}
                  </p>
                  {phoneDisplay ? (
                    <button
                      type="button"
                      onClick={() => void copyPhone()}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-brand hover:bg-white border border-transparent hover:border-line"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  ) : null}
                </div>
              </div>
              <Field
                label="Cidade / UF"
                value={[lead.cidade, lead.estado].filter(Boolean).join(' / ')}
              />
              <Field
                label="Entrada no quiz"
                value={
                  lead.created_at
                    ? new Date(lead.created_at).toLocaleString('pt-BR')
                    : '—'
                }
              />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" />
              Veículo
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Marca" value={lead.marca} />
              <Field label="Modelo" value={lead.modelo} />
              <Field label="Ano" value={lead.ano} mono />
              <Field label="Quilometragem" value={formatKm(lead.quilometragem)} mono />
              <Field label="Usa app do banco" value={lead.usa_aplicativo} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
              FIPE automática
            </h3>
            {lead.fipe && lead.fipe_status === 'ok' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Field label="Valor FIPE" value={lead.fipe.price} mono />
                <Field label="Código" value={lead.fipe.codeFipe} mono />
                <Field
                  label="Ano / combustível"
                  value={`${lead.fipe.modelYear} · ${lead.fipe.fuel}`}
                />
                <Field label="Referência" value={lead.fipe.referenceMonth} />
                <Field
                  label="Veículo FIPE"
                  value={`${lead.fipe.brand} ${lead.fipe.model}`}
                />
              </div>
            ) : (
              <p className="text-sm font-semibold text-muted">
                {lead.fipe_status === 'loading'
                  ? 'Consultando FIPE…'
                  : lead.fipe_error || 'Ainda sem FIPE neste lead.'}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Financiamento
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="Banco" value={lead.banco} />
              <Field label="Parcelas pagas" value={lead.parcelas_pagas} mono />
              <Field label="Parcelas atrasadas" value={lead.parcelas_atrasadas} mono />
              <Field label="Deu entrada" value={lead.deu_entrada} />
              <Field label="Valor da entrada" value={moneyOrText(lead.valor_entrada)} mono />
              <Field label="Tem débito" value={lead.tem_debito} />
              <Field label="Valor do débito" value={moneyOrText(lead.valor_debito)} mono />
            </div>
          </section>

          {Array.isArray(lead.fotos) && lead.fotos.length > 0 ? (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                Fotos ({lead.fotos.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {lead.fotos.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden border border-line bg-soft"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs text-[#4b5563] font-semibold">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-muted" />
              {lead.cidade || '—'}/{lead.estado || '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-muted" />
              {formatKm(lead.quilometragem)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-muted" />
              {phoneDisplay || '—'}
            </span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-line px-5 py-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-muted hover:text-ink"
          >
            Fechar
          </button>

          {wa && !finalized ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void markContacted()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe57] text-white px-4 py-2.5 text-sm font-bold transition-colors"
            >
              <WhatsAppIcon className="w-4 h-4" />
              Chamar no WhatsApp
            </a>
          ) : null}

          {showFinalize && contacted && !finalized ? (
            <button
              type="button"
              onClick={() => void markFinalized()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-ink hover:bg-black text-white px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-70"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Finalizar atendimento
            </button>
          ) : null}

          {finalized ? (
            <span className="inline-flex items-center gap-2 rounded-xl bg-soft text-brand px-4 py-2.5 text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Atendido
            </span>
          ) : null}

          {!wa && !finalized ? (
            <span className="inline-flex items-center rounded-xl bg-zinc-100 text-muted px-4 py-2.5 text-sm font-bold">
              Sem WhatsApp
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
