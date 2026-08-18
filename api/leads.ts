import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Endpoint legado na Vercel.
 * Leads e auth agora vivem no Cloudflare Worker.
 * Mantemos redirect/aviso para não deixar GET aberto sem autenticação.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const worker = 'https://alpha-recupera-api.cloakersubsub.workers.dev'
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'POST') {
    try {
      const upstream = await fetch(`${worker}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      })
      const data = await upstream.json()
      return res.status(upstream.status).json(data)
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e) })
    }
  }

  if (req.method === 'GET') {
    return res.status(401).json({
      ok: false,
      error: 'Leitura de leads exige autenticação no painel admin (Cloudflare).',
      api: worker,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
