import { useEffect, useState } from 'react'
import {
  Car,
  MapPin,
  Gauge,
  Building2,
  CheckCircle2,
  Loader2,
  ShoppingBag,
} from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import { formatKm, formatPhone, timeAgo } from '../lib/format'
import { createCvFromLead, updateLead } from '../lib/api'
import { LeadDetailModal } from './LeadDetailModal'
import {
  evaluateStoredLead,
  qualityBadgeClass,
  qualityLabel,
} from '@shared/leadQuality'
import { ensureLeadFipe } from '../lib/leadFipe'

function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function firstName(fullName: string | undefined) {
  const part = fullName?.trim().split(/\s+/)[0]
  return part || ''
}

function carLabel(lead: LeadRecord) {
  const parts = [lead.marca, lead.modelo, lead.ano].filter(Boolean)
  return parts.join(' ').trim() || 'seu carro'
}

function whatsappUrl(lead: LeadRecord, captadorName?: string) {
  const phone = whatsappDigits(lead.telefone)
  if (!phone) return null

  const captador = firstName(captadorName)
  const carro = carLabel(lead)
  const who = captador
    ? `Sou ${captador}, da Alpha Recupera`
    : 'Sou da Alpha Recupera'

  const text = `Oi! Tudo bem? ${who}. Temos interesse em comprar seu ${carro} agora mesmo — você tem 1 minutinho?`

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function LeadCard({
  lead,
  captadorName,
  showAssignee,
  onUpdated,
  onBought,
  showFinalize = true,
}: {
  lead: LeadRecord
  captadorName?: string
  showAssignee?: boolean
  onUpdated?: (lead: LeadRecord) => void
  /** chamado após marcar como comprado (vai para aba Compra) */
  onBought?: () => void
  showFinalize?: boolean
}) {
  const title = `${lead.marca} ${lead.modelo}`.trim() || 'Veículo'
  const wa = whatsappUrl(lead, captadorName)
  const [busy, setBusy] = useState(false)
  const [buyBusy, setBuyBusy] = useState(false)
  const [contactedLocal, setContactedLocal] = useState(false)
  const [open, setOpen] = useState(false)

  const finalized = lead.status === 'finalizado'
  const contacted = Boolean(lead.contacted_at) || contactedLocal
  const grade = evaluateStoredLead(lead)
  const gradeLabel = qualityLabel(grade.quality)
  const gradeClass = qualityBadgeClass(grade.quality)
  const [fipeBusy, setFipeBusy] = useState(false)

  useEffect(() => {
    if (finalized) return
    if (lead.fipe?.price) return
    if (lead.fipe_status === 'loading') return
    if (lead.fipe_status === 'error' || lead.fipe_status === 'not_found') return
    if (!lead.marca || !lead.modelo || !lead.ano) return

    let cancelled = false
    setFipeBusy(true)
    void ensureLeadFipe(lead)
      .then((updated) => {
        if (!cancelled) onUpdated?.(updated)
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setFipeBusy(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só dispara quando faltam dados FIPE
  }, [lead.id, lead.fipe?.price, lead.fipe_status, lead.marca, lead.modelo, lead.ano, finalized])

  const markContacted = async () => {
    setContactedLocal(true)
    if (lead.contacted_at || finalized) return
    try {
      const updated = await updateLead(lead.id, {
        contacted_at: new Date().toISOString(),
      })
      onUpdated?.(updated)
    } catch {
      /* mantém UI local mesmo se API falhar */
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

  const markBought = async () => {
    if (buyBusy) return
    setBuyBusy(true)
    try {
      const { deal } = await createCvFromLead(lead.id)
      // lead pode ter sido finalizado na API
      onUpdated?.({
        ...lead,
        status: 'finalizado',
        finalized_at: lead.finalized_at || new Date().toISOString(),
        contacted_at: lead.contacted_at || new Date().toISOString(),
      })
      sessionStorage.setItem('cv_focus_deal', deal.id)
      onBought?.()
    } catch {
      /* ignore */
    } finally {
      setBuyBusy(false)
    }
  }

  return (
    <>
      <article
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="rounded-2xl bg-white border border-line p-4 shadow-[0_4px_16px_rgba(255,106,0,0.04)] hover:border-[#ffd7a8] hover:shadow-[0_8px_24px_rgba(255,106,0,0.08)] transition-all cursor-pointer text-left"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-soft text-brand flex items-center justify-center shrink-0">
              <Car className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold truncate leading-tight">
                {title}
                {lead.ano ? (
                  <span className="text-muted font-semibold"> · {lead.ano}</span>
                ) : null}
              </h3>
              <p className="text-xs text-muted font-medium truncate mt-0.5">
                {lead.nome || 'Sem nome'} · {formatPhone(lead.telefone)}
                {showAssignee && lead.assigneeName
                  ? ` · ${lead.assigneeName}`
                  : ''}
              </p>
            </div>
          </div>

          <span
            className={`shrink-0 inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
              finalized ? 'bg-zinc-100 text-muted' : gradeClass
            }`}
          >
            {finalized ? 'Finalizado' : gradeLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#4b5563] mb-3">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Building2 className="w-3.5 h-3.5 text-muted" />
            {lead.banco || '—'}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold">
            <Gauge className="w-3.5 h-3.5 text-muted" />
            {formatKm(lead.quilometragem)}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold">
            <MapPin className="w-3.5 h-3.5 text-muted" />
            {lead.cidade || '—'}/{lead.estado || '—'}
          </span>
          <span className="font-semibold">
            <span className="text-muted font-medium">Atraso</span>{' '}
            {lead.parcelas_atrasadas || '—'}
          </span>
          {lead.fipe?.price ? (
            <span className="inline-flex items-center gap-1 font-extrabold text-brand">
              FIPE {lead.fipe.price}
            </span>
          ) : fipeBusy || lead.fipe_status === 'loading' ? (
            <span className="inline-flex items-center gap-1 font-semibold text-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              FIPE…
            </span>
          ) : null}
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-brand">
            {gradeLabel} · {timeAgo(lead.created_at)}
          </span>
        </div>

        {Array.isArray(lead.fotos) && lead.fotos.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2">
            {lead.fotos.slice(0, 5).map((url) => (
              <div
                key={url}
                className="shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-line bg-soft"
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] font-bold text-brand/80 mb-2">
          Toque para ver todos os dados →
        </p>

        <div
          className="pt-3 border-t border-[#f0ece7] flex flex-wrap items-center justify-end gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {wa && !finalized && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void markContacted()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe57] text-white px-3 py-1.5 text-xs font-bold transition-colors"
            >
              <WhatsAppIcon className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          )}

          {!finalized && (
            <button
              type="button"
              onClick={() => void markBought()}
              disabled={buyBusy}
              className="inline-flex items-center gap-1.5 rounded-lg btn-brand px-3 py-1.5 text-xs disabled:opacity-70"
            >
              {buyBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShoppingBag className="w-3.5 h-3.5" />
              )}
              Comprado
            </button>
          )}

          {showFinalize && contacted && !finalized && (
            <button
              type="button"
              onClick={() => void markFinalized()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink hover:bg-black text-white px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-70"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Finalizar
            </button>
          )}

          {finalized && (
            <button
              type="button"
              onClick={() => void markBought()}
              disabled={buyBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-soft text-brand px-3 py-1.5 text-xs font-bold hover:bg-white disabled:opacity-70"
            >
              {buyBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShoppingBag className="w-3.5 h-3.5" />
              )}
              Ir para Compra
            </button>
          )}

          {!wa && !finalized && (
            <span className="inline-flex items-center rounded-lg bg-zinc-100 text-muted px-3 py-1.5 text-xs font-bold">
              Sem WhatsApp
            </span>
          )}
        </div>
      </article>

      {open ? (
        <LeadDetailModal
          lead={lead}
          captadorName={captadorName}
          onClose={() => setOpen(false)}
          onUpdated={onUpdated}
          showFinalize={showFinalize}
        />
      ) : null}
    </>
  )
}
