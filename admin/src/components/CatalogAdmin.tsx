import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import type { CatalogVehicleRecord } from '@shared/catalog'
import { catalogTitle } from '@shared/catalog'
import {
  createCatalogVehicle,
  deleteCatalogVehicle,
  fetchCatalogAdmin,
  patchCatalogVehicle,
} from '../lib/adminApi'

const CATALOG_URL =
  (import.meta.env.VITE_CATALOG_URL as string | undefined) ||
  'https://catalogo.alpharecupera.com.br'

const emptyForm = {
  marca: '',
  modelo: '',
  ano: '',
  quilometragem: '',
  cor: '',
  combustivel: '',
  cambio: '',
  listPrice: '',
  description: '',
  fotos: '',
  video: '',
  cidade: '',
  estado: '',
  published: true,
  featured: false,
}

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CatalogAdmin() {
  const [items, setItems] = useState<CatalogVehicleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await fetchCatalogAdmin({ pageSize: '100' })
      setItems((r.items || []) as CatalogVehicleRecord[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar catálogo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (!form.marca.trim() || !form.modelo.trim()) {
      setError('Informe marca e modelo')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createCatalogVehicle({
        marca: form.marca,
        modelo: form.modelo,
        ano: form.ano,
        quilometragem: form.quilometragem,
        cor: form.cor,
        combustivel: form.combustivel,
        cambio: form.cambio,
        listPrice: form.listPrice ? Number(form.listPrice.replace(/\D/g, '')) : null,
        description: form.description,
        fotos: form.fotos
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        video: form.video.trim(),
        cidade: form.cidade,
        estado: form.estado,
        published: form.published,
        featured: form.featured,
      })
      setForm(emptyForm)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar')
    } finally {
      setBusy(false)
    }
  }

  const togglePublished = async (item: CatalogVehicleRecord) => {
    try {
      await patchCatalogVehicle(item.id, { published: !item.published })
      await load()
    } catch {
      setError('Não foi possível atualizar publicação')
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Remover este carro do catálogo público?')) return
    try {
      await deleteCatalogVehicle(id)
      await load()
    } catch {
      setError('Não foi possível remover')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Catálogo público</h2>
          <p className="text-sm text-muted font-medium mt-1">
            Carros disponíveis na empresa — aparecem em{' '}
            <a
              href={CATALOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand font-bold inline-flex items-center gap-1"
            >
              catalogo.alpharecupera.com.br
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-extrabold flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand" />
          Publicar veículo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(
            [
              ['marca', 'Marca *'],
              ['modelo', 'Modelo *'],
              ['ano', 'Ano'],
              ['quilometragem', 'Km'],
              ['cor', 'Cor'],
              ['combustivel', 'Combustível'],
              ['cambio', 'Câmbio'],
              ['listPrice', 'Preço (R$)'],
              ['cidade', 'Cidade'],
              ['estado', 'UF'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs font-bold text-muted">
              {label}
              <input
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
              />
            </label>
          ))}
        </div>
        <label className="block text-xs font-bold text-muted">
          Descrição
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            rows={3}
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
          />
        </label>
        <label className="block text-xs font-bold text-muted">
          Fotos (URLs, uma por linha)
          <textarea
            value={form.fotos}
            onChange={(e) => setForm((f) => ({ ...f, fotos: e.target.value }))}
            rows={2}
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
          />
        </label>
        <label className="block text-xs font-bold text-muted">
          Vídeo (YouTube, Vimeo ou link .mp4)
          <input
            value={form.video}
            onChange={(e) => setForm((f) => ({ ...f, video: e.target.value }))}
            placeholder="https://youtube.com/watch?v=..."
            className="mt-1 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) =>
                setForm((f) => ({ ...f, published: e.target.checked }))
              }
            />
            Publicado na vitrine
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) =>
                setForm((f) => ({ ...f, featured: e.target.checked }))
              }
            />
            Destaque
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="ml-auto btn-brand rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {busy ? 'Salvando…' : 'Adicionar ao catálogo'}
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-extrabold mb-3">
          Na vitrine ({items.filter((i) => i.published).length} publicados ·{' '}
          {items.length} total)
        </h3>
        {loading ? (
          <p className="text-muted font-medium">Carregando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-white border border-dashed border-[#d4d4d8] p-10 text-center">
            <p className="text-lg font-bold">Nenhum carro no catálogo ainda</p>
            <p className="text-muted mt-2 text-sm">
              Cadastre acima os veículos disponíveis para venda na empresa.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-line bg-white overflow-hidden flex"
              >
                <div className="w-28 shrink-0 bg-soft">
                  {item.fotos?.[0] ? (
                    <img
                      src={item.fotos[0]}
                      alt=""
                      className="w-full h-full object-cover min-h-[7rem]"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[7rem] flex items-center justify-center text-xs font-bold text-muted px-2 text-center">
                      Sem foto
                    </div>
                  )}
                </div>
                <div className="flex-1 p-3 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-extrabold truncate">
                        {catalogTitle(item)}
                      </p>
                      <p className="text-xs text-muted font-semibold mt-0.5">
                        {money(item.listPrice)}
                        {item.cidade
                          ? ` · ${item.cidade}/${item.estado || ''}`
                          : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-lg ${
                        item.published
                          ? 'bg-green-100 text-ok'
                          : 'bg-zinc-100 text-muted'
                      }`}
                    >
                      {item.published ? 'Online' : 'Oculto'}
                    </span>
                  </div>
                  <div className="mt-auto pt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void togglePublished(item)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold hover:bg-soft"
                    >
                      {item.published ? 'Ocultar' : 'Publicar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-bad hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
