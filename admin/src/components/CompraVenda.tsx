import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  ShoppingBag,
  Trash2,
  Upload,
} from 'lucide-react'
import type { CvDeal, CvDocumentKind, CvView } from '@shared/cv'
import { cvTitle, normalizeCvStatus, statusLabel } from '@shared/cv'
import { timeAgo } from '../lib/format'
import {
  createCvDeal,
  deleteCvDeal,
  deleteCvDocument,
  fetchCvDeals,
  updateCvDeal,
  uploadCvDocument,
} from '../lib/api'

type Draft = {
  cliente_nome: string
  cliente_telefone: string
  marca: string
  modelo: string
  ano: string
  placa: string
  km: string
  banco: string
  compra_valor: string
  compra_data: string
  compra_obs: string
  venda_valor: string
  venda_data: string
  venda_comprador: string
  venda_obs: string
}

function emptyDraft(): Draft {
  return {
    cliente_nome: '',
    cliente_telefone: '',
    marca: '',
    modelo: '',
    ano: '',
    placa: '',
    km: '',
    banco: '',
    compra_valor: '',
    compra_data: '',
    compra_obs: '',
    venda_valor: '',
    venda_data: '',
    venda_comprador: '',
    venda_obs: '',
  }
}

function draftFromDeal(d: CvDeal): Draft {
  return {
    cliente_nome: d.cliente_nome || '',
    cliente_telefone: d.cliente_telefone || '',
    marca: d.marca || '',
    modelo: d.modelo || '',
    ano: d.ano || '',
    placa: d.placa || '',
    km: d.km || '',
    banco: d.banco || '',
    compra_valor: d.compra_valor || '',
    compra_data: d.compra_data || '',
    compra_obs: d.compra_obs || '',
    venda_valor: d.venda_valor || '',
    venda_data: d.venda_data || '',
    venda_comprador: d.venda_comprador || '',
    venda_obs: d.venda_obs || '',
  }
}

const KIND_LABEL: Record<CvDocumentKind, string> = {
  compra: 'Compra',
  venda: 'Venda',
  outro: 'Outro',
}

const VIEW_META: Record<
  CvView,
  { title: string; empty: string; hint: string }
> = {
  compra: {
    title: 'Compra',
    empty: 'Nenhum carro em compra. Use “Comprado” no card do lead.',
    hint: 'Carros comprados — preencha a compra e envie para venda.',
  },
  venda: {
    title: 'Venda',
    empty: 'Nenhum carro em venda. Libere pela aba Compra.',
    hint: 'Carros liberados para venda — feche a venda aqui.',
  },
  cv: {
    title: 'Compra e Venda',
    empty: 'Nenhuma operação fechada ainda.',
    hint: 'Histórico dos carros que compramos e vendemos.',
  },
}

export function CompraVenda({
  view,
  focusDealId,
}: {
  view: CvView
  focusDealId?: string
}) {
  const meta = VIEW_META[view]
  const statusKey =
    view === 'compra' ? 'compra' : view === 'venda' ? 'venda' : 'fechado'

  const [deals, setDeals] = useState<CvDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [dirty, setDirty] = useState(false)
  const [uploadKind, setUploadKind] = useState<CvDocumentKind>(
    view === 'venda' ? 'venda' : 'compra',
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const items = await fetchCvDeals(statusKey)
      setDeals(items.map((d) => ({ ...d, status: normalizeCvStatus(d.status) })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [statusKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setUploadKind(view === 'venda' ? 'venda' : view === 'cv' ? 'outro' : 'compra')
  }, [view])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return deals
    return deals.filter((d) =>
      [d.cliente_nome, d.marca, d.modelo, d.ano, d.placa, d.cliente_telefone]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [deals, q])

  useEffect(() => {
    if (focusDealId && filtered.some((d) => d.id === focusDealId)) {
      setSelectedId(focusDealId)
      return
    }
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id)
    if (selectedId && !filtered.some((d) => d.id === selectedId)) {
      setSelectedId(filtered[0]?.id || '')
    }
  }, [filtered, selectedId, focusDealId])

  const selected = deals.find((d) => d.id === selectedId) || null

  useEffect(() => {
    if (!selected) {
      setDraft(emptyDraft())
      setDirty(false)
      return
    }
    setDraft(draftFromDeal(selected))
    setDirty(false)
  }, [selected?.id, selected?.updated_at])

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const createManual = async () => {
    if (view !== 'compra') return
    setSaving(true)
    setError('')
    try {
      const deal = await createCvDeal({
        status: 'compra',
        cliente_nome: 'Novo veículo',
        marca: '',
        modelo: '',
      })
      setDeals((prev) => [deal, ...prev])
      setSelectedId(deal.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar')
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const updated = await updateCvDeal(selected.id, {
        ...draft,
        status: normalizeCvStatus(selected.status),
      })
      setDeals((prev) =>
        prev.map((d) =>
          d.id === updated.id
            ? { ...updated, status: normalizeCvStatus(updated.status) }
            : d,
        ),
      )
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const advance = async (next: 'venda' | 'fechado') => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...draft,
        status: next,
        ...(next === 'fechado' && !draft.venda_data
          ? { venda_data: new Date().toISOString().slice(0, 10) }
          : {}),
      }
      const updated = await updateCvDeal(selected.id, payload)
      // some da lista desta aba
      setDeals((prev) => prev.filter((d) => d.id !== updated.id))
      setSelectedId('')
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao avançar')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    if (!window.confirm('Excluir este caso?')) return
    setSaving(true)
    setError('')
    try {
      await deleteCvDeal(selected.id)
      setDeals((prev) => prev.filter((d) => d.id !== selected.id))
      setSelectedId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir')
    } finally {
      setSaving(false)
    }
  }

  const onUpload = async (file: File | null) => {
    if (!selected || !file) return
    setSaving(true)
    setError('')
    try {
      const { deal } = await uploadCvDocument(selected.id, file, uploadKind)
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...deal, status: normalizeCvStatus(deal.status) }
            : d,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no upload')
    } finally {
      setSaving(false)
    }
  }

  const removeDoc = async (docId: string) => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const deal = await deleteCvDocument(selected.id, docId)
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...deal, status: normalizeCvStatus(deal.status) }
            : d,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover doc')
    } finally {
      setSaving(false)
    }
  }

  const docsByKind = (kind: CvDocumentKind) =>
    (selected?.docs || []).filter((d) => d.kind === kind)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">{meta.title}</p>
          <p className="text-xs text-muted font-medium">{meta.hint}</p>
        </div>
        {view === 'compra' ? (
          <button
            type="button"
            onClick={() => void createManual()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold hover:bg-soft disabled:opacity-60"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Novo manual
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
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
            <p className="mt-2 text-[11px] font-semibold text-muted">
              {filtered.length} carro{filtered.length === 1 ? '' : 's'}
              {loading ? ' · …' : ''}
            </p>
          </div>
          <div className="max-h-[68vh] overflow-y-auto divide-y divide-line">
            {!loading && filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted font-medium">{meta.empty}</p>
            ) : (
              filtered.map((d) => {
                const active = d.id === selectedId
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full text-left px-3.5 py-3 hover:bg-soft transition-colors ${
                      active ? 'bg-soft' : ''
                    }`}
                  >
                    <p className="text-sm font-extrabold truncate">{cvTitle(d)}</p>
                    <p className="text-xs text-muted font-medium truncate mt-0.5">
                      {d.cliente_nome || 'Sem cliente'}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-muted">
                      {view === 'cv'
                        ? [
                            d.compra_valor && `C ${d.compra_valor}`,
                            d.venda_valor && `V ${d.venda_valor}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Sem valores'
                        : view === 'venda'
                          ? d.compra_valor
                            ? `Compra ${d.compra_valor}`
                            : 'Sem valor compra'
                          : d.compra_valor
                            ? d.compra_valor
                            : 'Valor pendente'}
                      {' · '}
                      {(d.docs || []).length} doc
                      {(d.docs || []).length === 1 ? '' : 's'}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="space-y-4">
          {error ? (
            <div className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
              {error}
            </div>
          ) : null}

          {!selected ? (
            <div className="rounded-2xl border border-line bg-white h-[300px] flex items-center justify-center p-8 text-center">
              <div>
                <ShoppingBag className="w-9 h-9 text-[#d1d5db] mx-auto mb-3" />
                <p className="font-extrabold">Selecione um carro</p>
                <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
                  {meta.hint}
                </p>
              </div>
            </div>
          ) : (
            <>
              <article className="rounded-2xl border border-line bg-white overflow-hidden">
                <div className="px-4 sm:px-5 py-3.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      {statusLabel(normalizeCvStatus(selected.status))}
                    </p>
                    <h2 className="text-lg font-extrabold">{cvTitle(draft)}</h2>
                    <p className="text-xs text-muted font-medium">
                      Atualizado {timeAgo(selected.updated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={saving}
                      className="rounded-lg border border-line p-2 text-muted hover:text-bad hover:bg-red-50 disabled:opacity-60"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={saving || !dirty}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-1.5 text-xs font-bold hover:bg-soft disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : null}
                      Salvar
                    </button>
                    {view === 'compra' ? (
                      <button
                        type="button"
                        onClick={() => void advance('venda')}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-1.5 text-xs disabled:opacity-60"
                      >
                        Liberar para venda
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    {view === 'venda' ? (
                      <button
                        type="button"
                        onClick={() => void advance('fechado')}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-1.5 text-xs disabled:opacity-60"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Fechar venda
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-5">
                  <Block title="Veículo e cliente">
                    <Inp
                      label="Marca"
                      value={draft.marca}
                      onChange={(v) => setField('marca', v)}
                    />
                    <Inp
                      label="Modelo"
                      value={draft.modelo}
                      onChange={(v) => setField('modelo', v)}
                    />
                    <Inp
                      label="Ano"
                      value={draft.ano}
                      onChange={(v) => setField('ano', v)}
                    />
                    <Inp
                      label="Placa"
                      value={draft.placa}
                      onChange={(v) => setField('placa', v)}
                    />
                    <Inp
                      label="KM"
                      value={draft.km}
                      onChange={(v) => setField('km', v)}
                    />
                    <Inp
                      label="Banco"
                      value={draft.banco}
                      onChange={(v) => setField('banco', v)}
                    />
                    <Inp
                      label="Cliente (origem)"
                      value={draft.cliente_nome}
                      onChange={(v) => setField('cliente_nome', v)}
                    />
                    <Inp
                      label="Telefone"
                      value={draft.cliente_telefone}
                      onChange={(v) => setField('cliente_telefone', v)}
                    />
                  </Block>

                  {(view === 'compra' || view === 'cv') && (
                    <Block title="Compra">
                      <Inp
                        label="Valor compra"
                        value={draft.compra_valor}
                        onChange={(v) => setField('compra_valor', v)}
                        accent
                      />
                      <Inp
                        label="Data compra"
                        value={draft.compra_data}
                        onChange={(v) => setField('compra_data', v)}
                        type="date"
                      />
                      <div className="sm:col-span-2">
                        <Inp
                          label="Obs. compra"
                          value={draft.compra_obs}
                          onChange={(v) => setField('compra_obs', v)}
                        />
                      </div>
                    </Block>
                  )}

                  {(view === 'venda' || view === 'cv') && (
                    <Block title="Venda">
                      {view === 'venda' ? (
                        <>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                              Valor compra
                            </p>
                            <p className="mt-1 text-sm font-extrabold text-brand">
                              {draft.compra_valor || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                              Data compra
                            </p>
                            <p className="mt-1 text-sm font-bold">
                              {draft.compra_data || '—'}
                            </p>
                          </div>
                        </>
                      ) : null}
                      <Inp
                        label="Valor venda"
                        value={draft.venda_valor}
                        onChange={(v) => setField('venda_valor', v)}
                        accent
                      />
                      <Inp
                        label="Data venda"
                        value={draft.venda_data}
                        onChange={(v) => setField('venda_data', v)}
                        type="date"
                      />
                      <Inp
                        label="Comprador"
                        value={draft.venda_comprador}
                        onChange={(v) => setField('venda_comprador', v)}
                      />
                      <div className="sm:col-span-2">
                        <Inp
                          label="Obs. venda"
                          value={draft.venda_obs}
                          onChange={(v) => setField('venda_obs', v)}
                        />
                      </div>
                    </Block>
                  )}
                </div>
              </article>

              <article className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold">Documentos</p>
                    <p className="text-xs text-muted font-medium">
                      JPG, PNG ou PDF · máx. 8MB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={uploadKind}
                      onChange={(e) =>
                        setUploadKind(e.target.value as CvDocumentKind)
                      }
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold"
                    >
                      <option value="compra">Compra</option>
                      <option value="venda">Venda</option>
                      <option value="outro">Outro</option>
                    </select>
                    <label className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold hover:bg-soft cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Anexar
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null
                          e.target.value = ''
                          void onUpload(f)
                        }}
                      />
                    </label>
                  </div>
                </div>

                {(['compra', 'venda', 'outro'] as CvDocumentKind[]).map(
                  (kind) => {
                    const docs = docsByKind(kind)
                    if (!docs.length && kind === 'outro') return null
                    if (view === 'compra' && kind === 'venda') return null
                    return (
                      <div key={kind}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted mb-2">
                          {KIND_LABEL[kind]}
                          {docs.length ? ` · ${docs.length}` : ''}
                        </p>
                        {docs.length === 0 ? (
                          <p className="text-sm text-muted font-medium py-1">
                            Sem documentos de {KIND_LABEL[kind].toLowerCase()}.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {docs.map((doc) => (
                              <li
                                key={doc.id}
                                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
                              >
                                <FileText className="w-4 h-4 text-brand shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm font-bold truncate block hover:text-brand"
                                  >
                                    {doc.name}
                                  </a>
                                  <p className="text-[10px] font-semibold text-muted">
                                    {doc.uploaded_by
                                      ? `${doc.uploaded_by} · `
                                      : ''}
                                    {timeAgo(doc.uploaded_at)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void removeDoc(doc.id)}
                                  disabled={saving}
                                  className="p-1.5 rounded-lg text-muted hover:text-bad hover:bg-red-50 disabled:opacity-60"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  },
                )}
              </article>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-2.5">
        {title}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Inp({
  label,
  value,
  onChange,
  accent,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  accent?: boolean
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand focus:bg-white ${
          accent ? 'text-brand font-extrabold' : ''
        }`}
      />
    </label>
  )
}
