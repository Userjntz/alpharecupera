import type {
  LeadAnnotation,
  LeadFipeData,
  LeadRecord,
} from '@shared/leads'
import { makeAnnotationId, parseFipePriceNumber } from '@shared/leads'
import { formatBRL, parseMoneyBRL } from '@shared/proposta'
import { formatKm } from './format'
import { lookupFipeByNames } from './fipe'
import { updateLead } from './api'

function upsertAutoNote(
  list: LeadAnnotation[],
  id: string,
  title: string,
  body: string,
): LeadAnnotation[] {
  const now = new Date().toISOString()
  const existing = list.find((n) => n.id === id)
  const next: LeadAnnotation = {
    id,
    kind: 'auto',
    title,
    body,
    created_at: existing?.created_at || now,
    updated_at: now,
    author_name: 'Sistema',
  }
  if (existing) {
    return list.map((n) => (n.id === id ? next : n))
  }
  return [next, ...list]
}

export function buildLeadCarSummary(lead: LeadRecord): string {
  const lines = [
    `Cliente: ${lead.nome || '—'}`,
    `Contato: ${lead.telefone || '—'}`,
    `Local: ${[lead.cidade, lead.estado].filter(Boolean).join('/') || '—'}`,
    `Veículo: ${[lead.marca, lead.modelo, lead.ano].filter(Boolean).join(' ') || '—'}`,
    `Km: ${formatKm(lead.quilometragem)}`,
    `Banco: ${lead.banco || '—'}`,
    `Parcelas atrasadas: ${lead.parcelas_atrasadas || '—'}`,
    `Parcelas pagas: ${lead.parcelas_pagas || '—'}`,
    `Entrada: ${lead.deu_entrada === 'sim' ? lead.valor_entrada || 'Sim' : lead.deu_entrada || '—'}`,
    `Débito: ${lead.tem_debito === 'sim' ? lead.valor_debito || 'Sim' : lead.tem_debito || '—'}`,
    `Uso app: ${lead.usa_aplicativo || '—'}`,
  ]
  return lines.join('\n')
}

export function buildFipeAnnotationBody(fipe: LeadFipeData): string {
  return [
    `Valor FIPE: ${fipe.price}`,
    `Código FIPE: ${fipe.codeFipe}`,
    `Veículo FIPE: ${fipe.brand} ${fipe.model}`,
    `Ano/modelo: ${fipe.modelYear} · ${fipe.fuel}`,
    `Referência: ${fipe.referenceMonth}`,
    fipe.match_brand
      ? `Match: ${fipe.match_brand} / ${fipe.match_model} / ${fipe.match_year}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Garante anotações automáticas base do carro (sem FIPE ainda). */
export function withBaseAutoAnnotations(lead: LeadRecord): LeadAnnotation[] {
  let notes = Array.isArray(lead.annotations) ? [...lead.annotations] : []
  notes = upsertAutoNote(
    notes,
    'auto-resumo-carro',
    'Resumo do veículo',
    buildLeadCarSummary(lead),
  )
  if (lead.fipe && (lead.fipe_status === 'ok' || lead.fipe.source === 'manual')) {
    notes = upsertAutoNote(
      notes,
      'auto-fipe',
      'Tabela FIPE',
      buildFipeAnnotationBody(lead.fipe),
    )
  }
  return notes
}

export function buildManualFipe(
  lead: Pick<LeadRecord, 'marca' | 'modelo' | 'ano' | 'fipe'>,
  raw: string,
): LeadFipeData | null {
  const n = parseMoneyBRL(raw)
  if (n <= 0) return null
  return {
    price: formatBRL(n),
    price_number: n,
    brand: lead.fipe?.brand || lead.marca || '',
    model: lead.fipe?.model || lead.modelo || '',
    modelYear: lead.fipe?.modelYear || Number(lead.ano) || 0,
    fuel: lead.fipe?.fuel || '',
    codeFipe: 'manual',
    referenceMonth: 'Manual',
    fetched_at: new Date().toISOString(),
    source: 'manual',
  }
}

/** Grava FIPE digitada na ficha e na anotação da tabela. */
export function withManualFipePatch(
  lead: LeadRecord,
  raw: string,
): Partial<LeadRecord> | null {
  const fipe = buildManualFipe(lead, raw)
  if (!fipe) return null
  const next: LeadRecord = {
    ...lead,
    valor_fipe: fipe.price,
    fipe,
    fipe_status: 'ok',
    fipe_error: '',
  }
  return {
    valor_fipe: fipe.price,
    fipe,
    fipe_status: 'ok',
    fipe_error: '',
    annotations: withBaseAutoAnnotations(next),
  }
}

const inflight = new Map<string, Promise<LeadRecord>>()

/**
 * Busca FIPE do carro do lead, grava no lead e gera anotações automáticas.
 * Idempotente: se já tem fipe ok, só garante as anotações base.
 */
export async function ensureLeadFipe(
  lead: LeadRecord,
): Promise<LeadRecord> {
  const existing = inflight.get(lead.id)
  if (existing) return existing

  const run = (async () => {
    if (lead.fipe?.source === 'manual') {
      const baseNotes = withBaseAutoAnnotations(lead)
      if (
        JSON.stringify(lead.annotations || []) === JSON.stringify(baseNotes)
      ) {
        return lead
      }
      return updateLead(lead.id, { annotations: baseNotes })
    }

    if (!lead.fipe && parseMoneyBRL(lead.valor_fipe || '') > 0) {
      const patched = withManualFipePatch(lead, lead.valor_fipe || '')
      if (patched) return updateLead(lead.id, patched)
    }

    const baseNotes = withBaseAutoAnnotations(lead)

    if (lead.fipe && lead.fipe_status === 'ok') {
      const sameNotes =
        JSON.stringify(lead.annotations || []) === JSON.stringify(baseNotes)
      if (sameNotes) return lead
      return updateLead(lead.id, { annotations: baseNotes })
    }

    // Evita re-tentar em loop se já falhou recentemente com mesmos dados
    if (
      (lead.fipe_status === 'error' || lead.fipe_status === 'not_found') &&
      lead.fipe_error
    ) {
      if (
        JSON.stringify(lead.annotations || []) !== JSON.stringify(baseNotes)
      ) {
        return updateLead(lead.id, { annotations: baseNotes })
      }
      return lead
    }

    try {
      await updateLead(lead.id, { fipe_status: 'loading', fipe_error: '' })
      const found = await lookupFipeByNames(lead.marca, lead.modelo, lead.ano)
      const fipe: LeadFipeData = {
        price: found.detail.price,
        price_number:
          parseMoneyBRL(found.detail.price) ||
          parseFipePriceNumber(found.detail.price),
        brand: found.detail.brand,
        model: found.detail.model,
        modelYear: found.detail.modelYear,
        fuel: found.detail.fuel,
        codeFipe: found.detail.codeFipe,
        referenceMonth: found.detail.referenceMonth,
        fetched_at: new Date().toISOString(),
        match_brand: found.brand.name,
        match_model: found.model.name,
        match_year: found.year.name,
        source: 'auto',
      }

      let notes = withBaseAutoAnnotations({ ...lead, fipe, fipe_status: 'ok' })
      notes = upsertAutoNote(
        notes,
        'auto-fipe',
        'Tabela FIPE',
        buildFipeAnnotationBody(fipe),
      )

      return updateLead(lead.id, {
        fipe,
        fipe_status: 'ok',
        fipe_error: '',
        annotations: notes,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha na FIPE'
      const status =
        /não encontrada|nao encontrada|não encontrado|nao encontrado/i.test(msg)
          ? 'not_found'
          : 'error'
      const notes = withBaseAutoAnnotations(lead)
      return updateLead(lead.id, {
        fipe_status: status,
        fipe_error: msg,
        annotations: notes,
      })
    }
  })()

  inflight.set(lead.id, run)
  try {
    return await run
  } finally {
    inflight.delete(lead.id)
  }
}

export async function addLeadAnnotation(
  lead: LeadRecord,
  input: { title: string; body: string; author_name?: string; author_id?: string },
): Promise<LeadRecord> {
  const now = new Date().toISOString()
  const note: LeadAnnotation = {
    id: makeAnnotationId('manual'),
    kind: 'manual',
    title: input.title.trim() || 'Anotação',
    body: input.body.trim(),
    created_at: now,
    author_name: input.author_name,
    author_id: input.author_id,
  }
  const annotations = [note, ...(lead.annotations || [])]
  return updateLead(lead.id, { annotations })
}
