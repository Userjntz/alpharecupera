import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Car,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import { isLeadOpen, makeAnnotationId, makeLeadId, mergeLeadLists } from '@shared/leads'
import {
  evaluateLeadQuality,
  evaluateStoredLead,
  qualityBadgeClass,
  qualityLabel,
} from '@shared/leadQuality'
import { formatPhone, timeAgo } from '../lib/format'
import { createLead, updateLead } from '../lib/api'
import { addLeadAnnotation, ensureLeadFipe, withManualFipePatch } from '../lib/leadFipe'
import { parseMoneyBRL } from '@shared/proposta'
import { PropostaCalculator } from './PropostaCalculator'

type Draft = {
  nome: string
  telefone: string
  estado: string
  cidade: string
  marca: string
  modelo: string
  ano: string
  quilometragem: string
  banco: string
  deu_entrada: string
  valor_entrada: string
  parcelas_atrasadas: string
  parcelas_pagas: string
  tem_debito: string
  valor_debito: string
  usa_aplicativo: string
  valor_parcela: string
  quantas_vezes: string
  valor_fechado: string
  valor_fipe: string
}

function draftFromLead(lead: LeadRecord): Draft {
  return {
    nome: lead.nome || '',
    telefone: lead.telefone || '',
    estado: lead.estado || '',
    cidade: lead.cidade || '',
    marca: lead.marca || '',
    modelo: lead.modelo || '',
    ano: lead.ano || '',
    quilometragem: lead.quilometragem || '',
    banco: lead.banco || '',
    deu_entrada: lead.deu_entrada || '',
    valor_entrada: lead.valor_entrada || '',
    parcelas_atrasadas: lead.parcelas_atrasadas || '',
    parcelas_pagas: lead.parcelas_pagas || '',
    tem_debito: lead.tem_debito || '',
    valor_debito: lead.valor_debito || '',
    usa_aplicativo: lead.usa_aplicativo || '',
    valor_parcela: lead.valor_parcela || '',
    quantas_vezes: lead.quantas_vezes || '',
    valor_fechado: lead.valor_fechado || '',
    valor_fipe: lead.valor_fipe || lead.fipe?.price || '',
  }
}

function emptyCreate(): Draft {
  return {
    nome: '',
    telefone: '',
    estado: '',
    cidade: '',
    marca: '',
    modelo: '',
    ano: '',
    quilometragem: '',
    banco: '',
    deu_entrada: '',
    valor_entrada: '',
    parcelas_atrasadas: '',
    parcelas_pagas: '',
    tem_debito: '',
    valor_debito: '',
    usa_aplicativo: '',
    valor_parcela: '',
    quantas_vezes: '',
    valor_fechado: '',
    valor_fipe: '',
  }
}

export function LeadAnotacoes({
  leads,
  captadorName,
  captadorId,
  captadorSlug,
  onLeadUpdated,
  onLeadCreated,
}: {
  leads: LeadRecord[]
  captadorName?: string
  captadorId?: string
  captadorSlug?: string
  onLeadUpdated?: (lead: LeadRecord) => void
  onLeadCreated?: (lead: LeadRecord) => void
}) {
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(emptyCreate)
  const [createNote, setCreateNote] = useState('')
  const [createdLocal, setCreatedLocal] = useState<LeadRecord[]>([])

  const openLeads = useMemo(
    () =>
      mergeLeadLists(leads, createdLocal).filter(isLeadOpen),
    [leads, createdLocal],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return openLeads
    return openLeads.filter((l) =>
      [l.nome, l.marca, l.modelo, l.ano, l.telefone, l.cidade, l.banco]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [openLeads, q])

  useEffect(() => {
    if (createdLocal.some((l) => l.id === selectedId)) return
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id)
    if (selectedId && !filtered.some((l) => l.id === selectedId)) {
      setSelectedId(filtered[0]?.id || '')
    }
  }, [filtered, selectedId, createdLocal])

  const selected = openLeads.find((l) => l.id === selectedId) || null
  const grade = selected ? evaluateStoredLead(selected) : null

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      setDirty(false)
      return
    }
    setDraft(draftFromLead(selected))
    setDirty(false)
    setError('')
  }, [selected?.id])

  useEffect(() => {
    if (dirty || !selected?.fipe?.price) return
    setDraft((prev) => {
      if (!prev || prev.valor_fipe) return prev
      return { ...prev, valor_fipe: selected.fipe?.price || '' }
    })
  }, [selected?.fipe?.price, dirty])

  useEffect(() => {
    let cancelled = false
    const pending = openLeads.filter(
      (l) =>
        !l.fipe &&
        l.fipe_status !== 'loading' &&
        l.fipe_status !== 'error' &&
        l.fipe_status !== 'not_found' &&
        !parseMoneyBRL(l.valor_fipe || '') &&
        l.marca &&
        l.modelo &&
        l.ano,
    )
    if (!pending.length) return

    const run = async () => {
      setSyncing(true)
      for (const lead of pending.slice(0, 8)) {
        if (cancelled) break
        try {
          const updated = await ensureLeadFipe(lead)
          onLeadUpdated?.(updated)
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setSyncing(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [openLeads, onLeadUpdated])

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }

  const refreshFipe = async () => {
    if (!selected) return
    setError('')
    setSaving(true)
    try {
      const cleared = {
        ...selected,
        fipe: null,
        fipe_status: 'idle' as const,
        fipe_error: '',
        valor_fipe: '',
      }
      setDraft((prev) => (prev ? { ...prev, valor_fipe: '' } : prev))
      await updateLead(selected.id, {
        fipe: null,
        fipe_status: 'idle',
        fipe_error: '',
        valor_fipe: '',
      })
      const updated = await ensureLeadFipe(cleared)
      onLeadUpdated?.(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar FIPE')
    } finally {
      setSaving(false)
    }
  }

  const saveFicha = async () => {
    if (!selected || !draft) return
    setSaving(true)
    setError('')
    try {
      let patch: Partial<LeadRecord> = { ...draft }
      const typed = parseMoneyBRL(draft.valor_fipe)
      const current =
        selected.fipe?.source === 'manual'
          ? 0
          : selected.fipe?.price_number ||
            parseMoneyBRL(selected.fipe?.price || '')
      if (
        typed > 0 &&
        (selected.fipe?.source === 'manual' ||
          !selected.fipe ||
          Math.abs(typed - current) > 1)
      ) {
        const extra = withManualFipePatch(
          { ...selected, ...draft },
          draft.valor_fipe,
        )
        if (extra) patch = { ...patch, ...extra }
      }
      const updated = await updateLead(selected.id, patch)
      onLeadUpdated?.(updated)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const saveNote = async (body?: string) => {
    const text = (body ?? note).trim()
    if (!selected || !text) return
    setSaving(true)
    setError('')
    try {
      const updated = await addLeadAnnotation(selected, {
        title: body ? 'Proposta' : '',
        body: text,
        author_name: captadorName,
        author_id: captadorId,
      })
      onLeadUpdated?.(updated)
      if (!body) setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar anotação')
    } finally {
      setSaving(false)
    }
  }

  const applyFechado = (valor: string) => {
    setField('valor_fechado', valor)
  }

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!createDraft.nome.trim() && !createDraft.telefone.trim()) {
      setError('Informe nome ou telefone do cliente.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const grade = evaluateLeadQuality({
        ano: createDraft.ano,
        quilometragem: createDraft.quilometragem,
        banco: createDraft.banco,
        parcelasAtrasadas: createDraft.parcelas_atrasadas,
        temDebito: createDraft.tem_debito,
        usaParaAplicativo: createDraft.usa_aplicativo,
      })
      const now = new Date().toISOString()
      const lead: LeadRecord = {
        id: makeLeadId(),
        created_at: now,
        nome: createDraft.nome.trim(),
        telefone: createDraft.telefone.trim(),
        estado: createDraft.estado.trim(),
        cidade: createDraft.cidade.trim(),
        banco: createDraft.banco.trim(),
        marca: createDraft.marca.trim(),
        modelo: createDraft.modelo.trim(),
        ano: createDraft.ano.trim(),
        parcelas_atrasadas: createDraft.parcelas_atrasadas,
        parcelas_pagas: createDraft.parcelas_pagas,
        deu_entrada: createDraft.deu_entrada,
        valor_entrada: createDraft.valor_entrada,
        tem_debito:
          createDraft.valor_debito.trim() &&
          createDraft.valor_debito.replace(/[^\d]/g, '')
            ? 'sim'
            : createDraft.tem_debito,
        valor_debito: createDraft.valor_debito,
        quilometragem: createDraft.quilometragem,
        usa_aplicativo: createDraft.usa_aplicativo,
        qualified: grade.qualified,
        quality: grade.quality,
        score: grade.score,
        status: 'aberto',
        valor_parcela: createDraft.valor_parcela,
        quantas_vezes: createDraft.quantas_vezes,
        valor_fechado: createDraft.valor_fechado,
        valor_fipe: createDraft.valor_fipe,
        assigneeId: captadorId,
        assigneeName: captadorName,
        captadorSlug,
        origem: 'manual',
        createdById: captadorId,
        annotations: createNote.trim()
          ? [
              {
                id: makeAnnotationId('manual'),
                kind: 'manual' as const,
                title: 'Anotação',
                body: createNote.trim(),
                created_at: now,
                author_name: captadorName,
                author_id: captadorId,
              },
            ]
          : [],
      }
      const manual = withManualFipePatch(lead, createDraft.valor_fipe)
      if (manual) Object.assign(lead, manual)
      const created = await createLead(lead)
      setCreatedLocal((prev) => mergeLeadLists(prev, [created]))
      onLeadCreated?.(created)
      setSelectedId(created.id)
      setCreating(false)
      setCreateDraft(emptyCreate())
      setCreateNote('')
      setQ('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar lead')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
      <aside className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="p-3 border-b border-line">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-xl border border-line bg-soft pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand"
            />
          </label>
          <p className="mt-2 text-[11px] font-semibold text-muted flex items-center justify-between gap-1.5">
            <span className="inline-flex items-center gap-1.5">
              <NotebookPen className="w-3.5 h-3.5" />
              {filtered.length} caso{filtered.length === 1 ? '' : 's'}
              {syncing ? ' · FIPE…' : ''}
            </span>
            <button
              type="button"
              onClick={() => {
                setCreating(true)
                setError('')
              }}
              className="inline-flex items-center gap-1 rounded-lg btn-brand px-2 py-1 text-[11px]"
            >
              <Plus className="w-3 h-3" />
              Novo lead
            </button>
          </p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted font-medium">
              Nenhum lead aberto. Use Novo lead para quem veio fora do anúncio.
            </p>
          ) : (
            filtered.map((l) => {
              const g = evaluateStoredLead(l)
              const active = l.id === selectedId
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(l.id)
                    setCreating(false)
                  }}
                  className={`w-full text-left px-3.5 py-3 hover:bg-soft transition-colors ${
                    active ? 'bg-soft' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold truncate">
                        {l.nome || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted font-medium truncate mt-0.5">
                        {[l.marca, l.modelo, l.ano].filter(Boolean).join(' ') ||
                          'Veículo'}
                        {l.origem === 'manual' ? ' · manual' : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${qualityBadgeClass(g.quality)}`}
                    >
                      {qualityLabel(g.quality)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-extrabold text-brand">
                    {l.fipe?.price || l.valor_fipe
                      ? `FIPE ${l.fipe?.price || l.valor_fipe}`
                      : l.fipe_status === 'loading'
                        ? 'FIPE…'
                        : 'FIPE —'}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className="space-y-4">
        {creating ? (
          <form
            onSubmit={(e) => void submitCreate(e)}
            className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  Fora do anúncio
                </p>
                <h2 className="text-lg font-extrabold">Criar lead e anotação</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg border border-line p-1.5 hover:bg-soft"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {error ? (
              <div className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
                {error}
              </div>
            ) : null}
            <Section title="Cliente">
              <Field
                label="Nome"
                value={createDraft.nome}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, nome: v }))
                }
              />
              <Field
                label="Telefone"
                value={createDraft.telefone}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, telefone: v }))
                }
              />
              <Field
                label="Cidade"
                value={createDraft.cidade}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, cidade: v }))
                }
              />
              <Field
                label="UF"
                value={createDraft.estado}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, estado: v }))
                }
              />
            </Section>
            <Section title="Veículo">
              <Field
                label="Marca"
                value={createDraft.marca}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, marca: v }))
                }
              />
              <Field
                label="Modelo"
                value={createDraft.modelo}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, modelo: v }))
                }
              />
              <Field
                label="Ano"
                value={createDraft.ano}
                onChange={(v) => setCreateDraft((p) => ({ ...p, ano: v }))}
              />
              <Field
                label="KM"
                value={createDraft.quilometragem}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, quilometragem: v }))
                }
              />
              <Field
                label="Tabela FIPE"
                value={createDraft.valor_fipe}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, valor_fipe: v }))
                }
                accent
                hint="Digite se a busca automática não puxar"
              />
            </Section>
            <Section title="Financiamento">
              <Field
                label="Banco"
                value={createDraft.banco}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, banco: v }))
                }
              />
              <Field
                label="Valor parcela"
                value={createDraft.valor_parcela}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, valor_parcela: v }))
                }
              />
              <Field
                label="Quantas vezes"
                value={createDraft.quantas_vezes}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, quantas_vezes: v }))
                }
              />
              <Field
                label="Parcelas pagas"
                value={createDraft.parcelas_pagas}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, parcelas_pagas: v }))
                }
              />
              <Field
                label="Parcelas atrasadas"
                value={createDraft.parcelas_atrasadas}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, parcelas_atrasadas: v }))
                }
              />
              <Field
                label="Valor débito"
                value={createDraft.valor_debito}
                onChange={(v) =>
                  setCreateDraft((p) => ({ ...p, valor_debito: v }))
                }
              />
            </Section>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-1">
                Anotação
              </p>
              <textarea
                value={createNote}
                onChange={(e) => setCreateNote(e.target.value)}
                rows={3}
                placeholder="Como chegou, combinados, observações…"
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand resize-y"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-4 py-2.5 text-sm disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar lead
            </button>
          </form>
        ) : !selected || !draft ? (
          <div className="rounded-2xl border border-line bg-white h-[320px] flex items-center justify-center p-10 text-center">
            <div>
              <Car className="w-10 h-10 text-[#d1d5db] mx-auto mb-3" />
              <p className="font-extrabold">Selecione um caso</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Criar lead
              </button>
            </div>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
                {error}
              </div>
            ) : null}

            <article className="rounded-2xl border border-line bg-white overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Ficha · editável
                  </p>
                  <h2 className="text-lg font-extrabold truncate">
                    {draft.nome || 'Sem nome'}
                  </h2>
                  <p className="text-xs text-muted font-medium">
                    {formatPhone(draft.telefone)}
                    {draft.cidade
                      ? ` · ${draft.cidade}${draft.estado ? `/${draft.estado}` : ''}`
                      : ''}
                    {' · '}
                    {timeAgo(selected.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {grade ? (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg ${qualityBadgeClass(grade.quality)}`}
                    >
                      {qualityLabel(grade.quality)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void refreshFipe()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold hover:bg-soft disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    FIPE
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveFicha()}
                    disabled={saving || !dirty}
                    className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-1.5 text-xs disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    Salvar
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-5">
                <Section title="Cliente">
                  <Field
                    label="Nome"
                    value={draft.nome}
                    onChange={(v) => setField('nome', v)}
                  />
                  <Field
                    label="Telefone"
                    value={draft.telefone}
                    onChange={(v) => setField('telefone', v)}
                  />
                  <Field
                    label="Cidade"
                    value={draft.cidade}
                    onChange={(v) => setField('cidade', v)}
                  />
                  <Field
                    label="UF"
                    value={draft.estado}
                    onChange={(v) => setField('estado', v)}
                  />
                </Section>

                <Section title="Veículo">
                  <Field
                    label="Marca"
                    value={draft.marca}
                    onChange={(v) => setField('marca', v)}
                  />
                  <Field
                    label="Modelo"
                    value={draft.modelo}
                    onChange={(v) => setField('modelo', v)}
                  />
                  <Field
                    label="Ano"
                    value={draft.ano}
                    onChange={(v) => setField('ano', v)}
                  />
                  <Field
                    label="KM"
                    value={draft.quilometragem}
                    onChange={(v) => setField('quilometragem', v)}
                  />
                  <Field
                    label="Tabela FIPE"
                    value={draft.valor_fipe}
                    onChange={(v) => setField('valor_fipe', v)}
                    accent
                    hint={
                      selected.fipe_status === 'loading'
                        ? 'Buscando na tabela…'
                        : selected.fipe?.source === 'manual'
                          ? 'Valor digitado — a calculadora usa este número'
                          : selected.fipe?.price
                            ? 'Puxada automática. Edite se estiver errada.'
                            : selected.fipe_error
                              ? `Não puxou. Digite o valor da tabela (${selected.fipe_error})`
                              : 'Se a busca não achar, digite o valor da tabela aqui'
                    }
                  />
                </Section>

                <Section title="Financiamento">
                  <Field
                    label="Banco"
                    value={draft.banco}
                    onChange={(v) => setField('banco', v)}
                  />
                  <Select
                    label="Deu entrada"
                    value={draft.deu_entrada}
                    onChange={(v) => setField('deu_entrada', v)}
                    options={[
                      { value: '', label: '—' },
                      { value: 'sim', label: 'Sim' },
                      { value: 'nao', label: 'Não' },
                    ]}
                  />
                  <Field
                    label="Valor entrada"
                    value={draft.valor_entrada}
                    onChange={(v) => setField('valor_entrada', v)}
                  />
                  <Field
                    label="Valor parcela"
                    value={draft.valor_parcela}
                    onChange={(v) => setField('valor_parcela', v)}
                  />
                  <Field
                    label="Parcelas atrasadas"
                    value={draft.parcelas_atrasadas}
                    onChange={(v) => setField('parcelas_atrasadas', v)}
                  />
                  <Field
                    label="Parcelas pagas"
                    value={draft.parcelas_pagas}
                    onChange={(v) => setField('parcelas_pagas', v)}
                  />
                  <Field
                    label="Quantas vezes"
                    value={draft.quantas_vezes}
                    onChange={(v) => setField('quantas_vezes', v)}
                  />
                  <Select
                    label="Tem débito"
                    value={draft.tem_debito}
                    onChange={(v) => setField('tem_debito', v)}
                    options={[
                      { value: '', label: '—' },
                      { value: 'sim', label: 'Sim' },
                      { value: 'nao', label: 'Não' },
                    ]}
                  />
                  <Field
                    label="Valor débito"
                    value={draft.valor_debito}
                    onChange={(v) => setField('valor_debito', v)}
                  />
                  <Field
                    label="Usa app"
                    value={draft.usa_aplicativo}
                    onChange={(v) => setField('usa_aplicativo', v)}
                  />
                  <Field
                    label="Valor fechado"
                    value={draft.valor_fechado}
                    onChange={(v) => setField('valor_fechado', v)}
                    accent
                  />
                </Section>
              </div>
            </article>

            <PropostaCalculator
              lead={selected}
              draft={draft}
              busy={saving}
              onApplyFechado={applyFechado}
              onSaveNote={(body) => void saveNote(body)}
            />

            <div className="rounded-2xl border border-line bg-white p-4 space-y-3">
              <p className="text-sm font-extrabold">Anotação rápida</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Combinados, vistoria, observações…"
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand resize-y"
              />
              <button
                type="button"
                onClick={() => void saveNote()}
                disabled={saving || !note.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-soft disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {(selected.annotations || []).length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted px-1">
                  Histórico · {(selected.annotations || []).length}
                </p>
                {(selected.annotations || []).map((n) => (
                  <article
                    key={n.id}
                    className="rounded-xl border border-line px-4 py-3 bg-white"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                          n.kind === 'auto'
                            ? 'bg-soft text-muted'
                            : 'bg-brand/10 text-brand'
                        }`}
                      >
                        {n.kind === 'auto' ? 'Auto' : 'Nota'}
                      </span>
                      <span className="text-[10px] font-semibold text-muted ml-auto">
                        {n.author_name ? `${n.author_name} · ` : ''}
                        {timeAgo(n.updated_at || n.created_at)}
                      </span>
                    </div>
                    {n.title ? (
                      <p className="text-sm font-extrabold mb-0.5">{n.title}</p>
                    ) : null}
                    <pre className="whitespace-pre-wrap text-sm font-medium text-[#374151] font-sans leading-relaxed">
                      {n.body}
                    </pre>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2.5">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  accent,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  accent?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={`mt-1 w-full rounded-lg border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand focus:bg-white ${
          accent ? 'text-brand font-extrabold' : ''
        }`}
      />
      {hint ? (
        <span className="mt-1 block text-[10px] font-semibold text-muted leading-snug">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand focus:bg-white"
      >
        {options.map((o) => (
          <option key={o.value || 'empty'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
