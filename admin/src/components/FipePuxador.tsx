import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Car,
  Check,
  Copy,
  Loader2,
  Search,
  Table2,
} from 'lucide-react'
import {
  FIPE_TYPE_OPTIONS,
  fetchFipeBrands,
  fetchFipeDetail,
  fetchFipeModels,
  fetchFipeYears,
  type FipeDetail,
  type FipeNamed,
  type FipeVehicleType,
} from '../lib/fipe'

function filterList(items: FipeNamed[], q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => item.name.toLowerCase().includes(needle))
}

function FieldSelect({
  label,
  placeholder,
  items,
  value,
  onChange,
  disabled,
  loading,
  filterPlaceholder,
}: {
  label: string
  placeholder: string
  items: FipeNamed[]
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  loading?: boolean
  filterPlaceholder: string
}) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => filterList(items, q), [items, q])

  useEffect(() => {
    setQ('')
  }, [items])

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold flex items-center gap-2">
        {label}
        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-muted animate-spin" />
        )}
      </span>
      <div
        className={`rounded-2xl border bg-white overflow-hidden ${
          disabled ? 'border-line opacity-55' : 'border-line focus-within:border-brand'
        }`}
      >
        <div className="flex items-center gap-2 px-3 border-b border-line/80">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={disabled || loading || items.length === 0}
            placeholder={filterPlaceholder}
            className="w-full bg-transparent outline-none text-sm font-medium placeholder:text-muted/80 py-2.5 disabled:cursor-not-allowed"
          />
        </div>
        <select
          value={value}
          disabled={disabled || loading || items.length === 0}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-sm font-semibold px-3 py-2.5 cursor-pointer disabled:cursor-not-allowed"
        >
          <option value="">
            {loading
              ? 'Carregando…'
              : items.length === 0
                ? 'Aguardando…'
                : placeholder}
          </option>
          {filtered.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {!loading && items.length > 0 && q && (
        <p className="text-xs text-muted font-medium px-0.5">
          {filtered.length === 1
            ? '1 resultado'
            : `${filtered.length} resultados`}
        </p>
      )}
    </label>
  )
}

function CopyChip({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setOk(true)
          window.setTimeout(() => setOk(false), 1400)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-soft transition-colors"
    >
      {ok ? (
        <Check className="w-3.5 h-3.5 text-ok" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted" />
      )}
      {label}
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#fffaf3] border border-line px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="text-sm font-semibold mt-0.5 break-words">{value}</p>
    </div>
  )
}

export function FipePuxador() {
  const [type, setType] = useState<FipeVehicleType>('cars')
  const [brands, setBrands] = useState<FipeNamed[]>([])
  const [models, setModels] = useState<FipeNamed[]>([])
  const [years, setYears] = useState<FipeNamed[]>([])
  const [brandId, setBrandId] = useState('')
  const [modelId, setModelId] = useState('')
  const [yearId, setYearId] = useState('')
  const [detail, setDetail] = useState<FipeDetail | null>(null)
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [loadingModels, setLoadingModels] = useState(false)
  const [loadingYears, setLoadingYears] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')
  const brandsReq = useRef(0)
  const modelsReq = useRef(0)
  const yearsReq = useRef(0)
  const detailReq = useRef(0)

  useEffect(() => {
    const id = ++brandsReq.current
    setLoadingBrands(true)
    setError('')
    setBrands([])
    setModels([])
    setYears([])
    setBrandId('')
    setModelId('')
    setYearId('')
    setDetail(null)

    void fetchFipeBrands(type)
      .then((list) => {
        if (brandsReq.current !== id) return
        setBrands(list)
      })
      .catch((err: unknown) => {
        if (brandsReq.current !== id) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar marcas')
      })
      .finally(() => {
        if (brandsReq.current !== id) return
        setLoadingBrands(false)
      })
  }, [type])

  useEffect(() => {
    if (!brandId) {
      setModels([])
      setModelId('')
      setYears([])
      setYearId('')
      setDetail(null)
      return
    }
    const id = ++modelsReq.current
    setLoadingModels(true)
    setError('')
    setModels([])
    setModelId('')
    setYears([])
    setYearId('')
    setDetail(null)

    void fetchFipeModels(type, brandId)
      .then((list) => {
        if (modelsReq.current !== id) return
        setModels(list)
      })
      .catch((err: unknown) => {
        if (modelsReq.current !== id) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar modelos')
      })
      .finally(() => {
        if (modelsReq.current !== id) return
        setLoadingModels(false)
      })
  }, [type, brandId])

  useEffect(() => {
    if (!brandId || !modelId) {
      setYears([])
      setYearId('')
      setDetail(null)
      return
    }
    const id = ++yearsReq.current
    setLoadingYears(true)
    setError('')
    setYears([])
    setYearId('')
    setDetail(null)

    void fetchFipeYears(type, brandId, modelId)
      .then((list) => {
        if (yearsReq.current !== id) return
        setYears(list)
      })
      .catch((err: unknown) => {
        if (yearsReq.current !== id) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar anos')
      })
      .finally(() => {
        if (yearsReq.current !== id) return
        setLoadingYears(false)
      })
  }, [type, brandId, modelId])

  useEffect(() => {
    if (!brandId || !modelId || !yearId) {
      setDetail(null)
      return
    }
    const id = ++detailReq.current
    setLoadingDetail(true)
    setError('')
    setDetail(null)

    void fetchFipeDetail(type, brandId, modelId, yearId)
      .then((data) => {
        if (detailReq.current !== id) return
        setDetail(data)
      })
      .catch((err: unknown) => {
        if (detailReq.current !== id) return
        setError(err instanceof Error ? err.message : 'Erro ao puxar FIPE')
      })
      .finally(() => {
        if (detailReq.current !== id) return
        setLoadingDetail(false)
      })
  }, [type, brandId, modelId, yearId])

  return (
    <div className="max-w-4xl space-y-5">
      <section className="rounded-3xl bg-white border border-line p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-soft text-brand flex items-center justify-center shrink-0">
            <Table2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight">
              Puxador FIPE
            </h2>
            <p className="text-sm text-muted font-medium mt-0.5">
              Escolha marca, modelo e ano — a tabela FIPE aparece na hora.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {FIPE_TYPE_OPTIONS.map((opt) => {
            const active = type === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setType(opt.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? 'btn-brand shadow-none'
                    : 'bg-[#fff8ef] text-[#4b5563] hover:bg-soft'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FieldSelect
            label="Marca"
            placeholder="Selecionar marca"
            filterPlaceholder="Buscar marca…"
            items={brands}
            value={brandId}
            onChange={setBrandId}
            loading={loadingBrands}
          />
          <FieldSelect
            label="Modelo"
            placeholder="Selecionar modelo"
            filterPlaceholder="Buscar modelo…"
            items={models}
            value={modelId}
            onChange={setModelId}
            disabled={!brandId}
            loading={loadingModels}
          />
          <FieldSelect
            label="Ano / combustível"
            placeholder="Selecionar ano"
            filterPlaceholder="Filtrar ano…"
            items={years}
            value={yearId}
            onChange={setYearId}
            disabled={!modelId}
            loading={loadingYears}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
            {error}
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-white border border-line p-5 sm:p-6 min-h-[220px]">
        {loadingDetail ? (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-muted">
            <Loader2 className="w-7 h-7 animate-spin text-brand" />
            <p className="text-sm font-semibold">Puxando tabela FIPE…</p>
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Valor FIPE
                </p>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand mt-1">
                  {detail.price}
                </p>
                <p className="text-sm text-muted font-medium mt-1">
                  Ref. {detail.referenceMonth}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyChip label="Copiar preço" value={detail.price} />
                <CopyChip label="Copiar código" value={detail.codeFipe} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label="Marca" value={detail.brand} />
              <InfoRow label="Modelo" value={detail.model} />
              <InfoRow label="Ano modelo" value={String(detail.modelYear)} />
              <InfoRow label="Combustível" value={detail.fuel} />
              <InfoRow label="Código FIPE" value={detail.codeFipe} />
              <InfoRow label="Mês referência" value={detail.referenceMonth} />
            </div>
          </div>
        ) : (
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-soft text-brand flex items-center justify-center mb-3">
              <Car className="w-6 h-6" />
            </div>
            <p className="font-bold">Nada selecionado ainda</p>
            <p className="text-sm text-muted mt-1 max-w-sm">
              Selecione marca, modelo e ano acima para ver o preço médio da
              tabela FIPE.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
