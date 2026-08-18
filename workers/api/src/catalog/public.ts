import {
  toPublicCatalogVehicle,
  type CatalogVehicleRecord,
} from '../../../../shared/catalog'
import { createAdminKvStore } from '../admin/store'

type JsonFn = (
  data: unknown,
  status?: number,
  origin?: string | null,
) => Response

/** Rotas públicas do catálogo (sem auth). */
export async function handlePublicCatalog(ctx: {
  req: Request
  url: URL
  origin: string | null
  env: { LEADS_KV: KVNamespace }
  json: JsonFn
}): Promise<Response | null> {
  const { req, url, origin, env, json } = ctx
  const p = url.pathname

  if (p === '/catalog/vehicles' && req.method === 'GET') {
    const store = createAdminKvStore(env.LEADS_KV)
    const all = (await store.listCatalog()) as CatalogVehicleRecord[]
    const q = String(url.searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    let items = all.filter((v) => v && v.published !== false)
    if (q) {
      items = items.filter((v) => {
        const hay = [v.marca, v.modelo, v.ano, v.cor, v.cidade, v.estado]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    items.sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1
      }
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
    return json(
      {
        ok: true,
        vehicles: items.map(toPublicCatalogVehicle),
        total: items.length,
      },
      200,
      origin,
    )
  }

  const one = p.match(/^\/catalog\/vehicles\/([^/]+)$/)
  if (one && req.method === 'GET') {
    const store = createAdminKvStore(env.LEADS_KV)
    const all = (await store.listCatalog()) as CatalogVehicleRecord[]
    const item = all.find((v) => v.id === decodeURIComponent(one[1]))
    if (!item || item.published === false) {
      return json({ ok: false, error: 'Veículo não encontrado' }, 404, origin)
    }
    return json(
      { ok: true, vehicle: toPublicCatalogVehicle(item) },
      200,
      origin,
    )
  }

  return null
}
