import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import type { PaymentDirection, PaymentRecord, PaymentTotals } from '@shared/payments'
import { formatMoney } from '@shared/payments'
import {
  createPayment,
  deletePayment,
  fetchPayments,
  syncPayments,
  updatePayment,
} from '../lib/api'

const emptyTotals: PaymentTotals = {
  entradas: 0,
  saidas: 0,
  saldo: 0,
  pendenteEntrada: 0,
  pendenteSaida: 0,
}

export function Pagamentos() {
  const [items, setItems] = useState<PaymentRecord[]>([])
  const [totals, setTotals] = useState<PaymentTotals>(emptyTotals)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState({
    direction: 'entrada' as PaymentDirection,
    amount_label: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    status: 'pago' as 'pago' | 'pendente',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchPayments()
      setItems(data.items)
      setTotals(data.totals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'todos') return items
    return items.filter((p) => p.direction === filter)
  }, [items, filter])

  const resync = async () => {
    setSaving(true)
    setError('')
    try {
      const data = await syncPayments()
      setItems(data.items)
      setTotals(data.totals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao sincronizar')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (p: PaymentRecord) => {
    setSaving(true)
    try {
      const updated = await updatePayment(p.id, {
        status: p.status === 'pago' ? 'pendente' : 'pago',
      })
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      const data = await fetchPayments()
      setTotals(data.totals)
      setItems(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar')
    } finally {
      setSaving(false)
    }
  }

  const saveManual = async () => {
    if (!draft.amount_label.trim()) return
    setSaving(true)
    setError('')
    try {
      await createPayment({
        direction: draft.direction,
        amount_label: draft.amount_label,
        date: draft.date,
        description: draft.description || 'Pagamento manual',
        status: draft.status,
        source: 'manual',
      })
      setFormOpen(false)
      setDraft({
        direction: 'entrada',
        amount_label: '',
        date: new Date().toISOString().slice(0, 10),
        description: '',
        status: 'pago',
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p: PaymentRecord) => {
    if (p.source !== 'manual') return
    if (!window.confirm('Excluir este lançamento?')) return
    setSaving(true)
    try {
      await deletePayment(p.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao excluir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {error ? (
        <div className="rounded-xl bg-red-50 text-bad px-3 py-2 text-sm font-semibold">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          label="Entradas (vendas)"
          value={formatMoney(totals.entradas)}
          hint={
            totals.pendenteEntrada
              ? `${formatMoney(totals.pendenteEntrada)} pendente`
              : 'Recebido'
          }
          tone="in"
        />
        <Kpi
          label="Saídas (compras)"
          value={formatMoney(totals.saidas)}
          hint={
            totals.pendenteSaida
              ? `${formatMoney(totals.pendenteSaida)} pendente`
              : 'Pago'
          }
          tone="out"
        />
        <Kpi
          label="Saldo"
          value={formatMoney(totals.saldo)}
          hint="Entradas − saídas"
          tone={totals.saldo >= 0 ? 'ok' : 'warn'}
        />
      </div>

      <div className="rounded-2xl border border-line bg-white p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line overflow-hidden">
          {(
            [
              ['todos', 'Todos'],
              ['entrada', 'Entradas'],
              ['saida', 'Saídas'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-2 text-xs font-bold ${
                filter === id
                  ? 'bg-brand text-white'
                  : 'bg-white text-muted hover:bg-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void resync()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold hover:bg-soft disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Sync C/V
        </button>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl btn-brand px-3.5 py-2 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Lançamento
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Wallet className="w-4 h-4 text-brand" />
          <p className="text-sm font-extrabold">
            Movimentações
            <span className="text-muted font-semibold">
              {' '}
              · {filtered.length}
            </span>
          </p>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-muted font-medium flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando…
          </p>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-extrabold">Nenhum pagamento ainda</p>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">
              Preencha valores em Compra/Venda ou adicione um lançamento
              manual. O saldo acumula automaticamente.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((p) => {
              const isIn = p.direction === 'entrada'
              return (
                <li
                  key={p.id}
                  className="px-4 py-3.5 flex flex-wrap items-center gap-3 hover:bg-soft/60"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isIn
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {isIn ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold truncate">
                      {p.description || p.vehicle_label || 'Pagamento'}
                    </p>
                    <p className="text-[11px] font-semibold text-muted mt-0.5">
                      {p.source === 'compra'
                        ? 'Compra'
                        : p.source === 'venda'
                          ? 'Venda'
                          : 'Manual'}
                      {p.vehicle_label ? ` · ${p.vehicle_label}` : ''}
                      {p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                      {' · '}
                      {p.date || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-extrabold ${
                        isIn ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {isIn ? '+' : '−'}
                      {formatMoney(p.amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(p)}
                      className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${
                        p.status === 'pago'
                          ? 'text-muted'
                          : 'text-amber-700'
                      }`}
                    >
                      {p.status === 'pago' ? 'Pago' : 'Pendente'}
                    </button>
                  </div>
                  {p.source === 'manual' ? (
                    <button
                      type="button"
                      onClick={() => void remove(p)}
                      className="p-1.5 rounded-lg text-muted hover:text-bad hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-line p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-extrabold">Novo lançamento</p>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg hover:bg-soft"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex rounded-xl border border-line overflow-hidden">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, direction: 'entrada' }))}
                className={`flex-1 py-2 text-xs font-bold ${
                  draft.direction === 'entrada'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-muted'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, direction: 'saida' }))}
                className={`flex-1 py-2 text-xs font-bold ${
                  draft.direction === 'saida'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white text-muted'
                }`}
              >
                Saída
              </button>
            </div>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Valor
              <input
                value={draft.amount_label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amount_label: e.target.value }))
                }
                placeholder="Ex.: R$ 5.000"
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Data
              <input
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, date: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Descrição
              <input
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                placeholder="Ex.: Sinal, comissão…"
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold focus:outline-none focus:border-brand"
              />
            </label>
            <label className="block text-[10px] font-bold uppercase text-muted">
              Status
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    status: e.target.value === 'pendente' ? 'pendente' : 'pago',
                  }))
                }
                className="mt-1 w-full rounded-xl border border-line bg-[#fafafa] px-3 py-2 text-sm font-semibold"
              >
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-line px-4 py-2 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveManual()}
                disabled={saving || !draft.amount_label.trim()}
                className="rounded-xl btn-brand px-4 py-2 text-xs disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'in' | 'out' | 'ok' | 'warn'
}) {
  const color =
    tone === 'in'
      ? 'text-emerald-700'
      : tone === 'out'
        ? 'text-rose-700'
        : tone === 'warn'
          ? 'text-amber-700'
          : 'text-brand'
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className={`mt-1 text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[11px] font-semibold text-muted mt-1">{hint}</p>
    </div>
  )
}
