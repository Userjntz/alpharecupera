import type { LeadQuality, LeadRecord } from '@shared/leads'
import { evaluateStoredLead, qualityLabel } from '@shared/leadQuality'
import { UF_NAMES, resolveLeadUf } from './ddd'

export type LeadExportFilter = 'todos' | 'bons' | 'medios' | 'ruins' | 'manual'

/**
 * Cabeçalhos oficiais da lista de clientes da Meta.
 * @see https://www.facebook.com/business/help/2082575038703844
 *
 * Só entram colunas com dado real. Coluna vazia (email, dob, value, uid)
 * a Meta pode mapear errado.
 */
export const META_CSV_HEADERS = [
  'phone',
  'fn',
  'ln',
  'ct',
  'st',
  'country',
] as const

const COMPLETE_HEADERS = [
  'id',
  'qualidade',
  'score',
  'fn',
  'ln',
  'nome',
  'phone',
  'telefone',
  'cidade',
  'estado',
  'country',
  'marca',
  'modelo',
  'ano',
  'quilometragem',
  'banco',
  'parcelas_atrasadas',
  'parcelas_pagas',
  'tem_debito',
  'valor_debito',
  'valor_parcela',
  'valor_fechado',
  'status',
  'created_at',
] as const

/** Letras, espaço, hífen e apóstrofo — como nos exemplos da Meta (Émilie, Jacobs-Anderson). */
function cleanNamePart(value: string) {
  return String(value || '')
    .replace(/[0-9]/g, '')
    .replace(/[^A-Za-zÀ-ÿ'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanPlace(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeMetaPhone(phone: string) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  digits = digits.replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  if (!digits.startsWith('55')) digits = `55${digits}`
  if (digits.length < 12 || digits.length > 13) return ''
  return `+${digits}`
}

export function splitMetaName(nome: string) {
  const parts = cleanNamePart(nome).split(' ').filter(Boolean)
  if (!parts.length) return { fn: '', ln: '' }
  return { fn: parts[0], ln: parts.slice(1).join(' ') }
}

export function metaStateName(lead: LeadRecord) {
  const uf = resolveLeadUf(lead)
  if (!uf) return ''
  return UF_NAMES[uf] || uf
}

export function csvCell(value: string | number | undefined | null) {
  const raw = value == null ? '' : String(value)
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

export function toCsv(headers: readonly string[], rows: string[][]) {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join(
    '\r\n',
  )
}

export function leadQualityKey(lead: LeadRecord): LeadQuality {
  return evaluateStoredLead(lead).quality
}

export function filterLeadsForExport(
  leads: LeadRecord[],
  filter: LeadExportFilter,
  selectedIds: Set<string>,
) {
  if (filter === 'manual') {
    return leads.filter((l) => selectedIds.has(l.id))
  }
  if (filter === 'bons') {
    return leads.filter((l) => leadQualityKey(l) === 'quente')
  }
  if (filter === 'medios') {
    return leads.filter((l) => leadQualityKey(l) === 'morno')
  }
  if (filter === 'ruins') {
    return leads.filter((l) => leadQualityKey(l) === 'frio')
  }
  return leads
}

export function countByQuality(leads: LeadRecord[]) {
  let bons = 0
  let medios = 0
  let ruins = 0
  for (const lead of leads) {
    const q = leadQualityKey(lead)
    if (q === 'quente') bons += 1
    else if (q === 'morno') medios += 1
    else ruins += 1
  }
  return { todos: leads.length, bons, medios, ruins }
}

function metaRow(lead: LeadRecord) {
  const { fn, ln } = splitMetaName(lead.nome)
  return {
    phone: normalizeMetaPhone(lead.telefone),
    fn,
    ln,
    ct: cleanPlace(lead.cidade || ''),
    st: metaStateName(lead),
    country: 'BR',
  }
}

export function buildMetaAudienceCsv(leads: LeadRecord[]) {
  const usable = leads.filter((l) => normalizeMetaPhone(l.telefone))
  const skipped = leads.length - usable.length
  const rows = usable.map((lead) => {
    const row = metaRow(lead)
    return [row.phone, row.fn, row.ln, row.ct, row.st, row.country]
  })
  return { csv: toCsv(META_CSV_HEADERS, rows), count: usable.length, skipped }
}

export function buildCompleteLeadsCsv(leads: LeadRecord[]) {
  const rows = leads.map((lead) => {
    const phone = normalizeMetaPhone(lead.telefone)
    const { fn, ln } = splitMetaName(lead.nome)
    const grade = evaluateStoredLead(lead)
    const uf = resolveLeadUf(lead) || ''
    return [
      lead.id,
      qualityLabel(grade.quality),
      String(grade.score),
      fn,
      ln,
      lead.nome || '',
      phone,
      lead.telefone || '',
      lead.cidade || '',
      uf,
      'BR',
      lead.marca || '',
      lead.modelo || '',
      lead.ano || '',
      lead.quilometragem || '',
      lead.banco || '',
      lead.parcelas_atrasadas || '',
      lead.parcelas_pagas || '',
      lead.tem_debito || '',
      lead.valor_debito || '',
      lead.valor_parcela || '',
      lead.valor_fechado || '',
      lead.status || 'aberto',
      lead.created_at || '',
    ]
  })
  return { csv: toCsv(COMPLETE_HEADERS, rows), count: leads.length }
}

export function downloadCsv(
  filename: string,
  csv: string,
  opts: { excelBom?: boolean } = {},
) {
  const body = opts.excelBom ? `\uFEFF${csv}` : csv
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportFilename(
  kind: 'meta' | 'completo',
  filter: LeadExportFilter,
) {
  const day = new Date().toISOString().slice(0, 10)
  return `alpha-leads-${kind}-${filter}-${day}.csv`
}
