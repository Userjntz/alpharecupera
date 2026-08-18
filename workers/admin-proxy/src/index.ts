/**
 * Encaminha admin.alpharecupera.com.br → alpharecupera-admin.pages.dev
 * enquanto o CNAME do domínio customizado do Pages não estiver ativo.
 */
const TARGET_HOST = 'alpharecupera-admin.pages.dev'

export default {
  async fetch(request: Request): Promise<Response> {
    const incoming = new URL(request.url)
    const target = new URL(request.url)
    target.hostname = TARGET_HOST
    target.protocol = 'https:'

    const headers = new Headers(request.headers)
    headers.set('Host', TARGET_HOST)
    headers.delete('cf-connecting-ip')

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: 'manual',
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
    }

    const response = await fetch(target.toString(), init)
    const out = new Headers(response.headers)
    // Evita que o browser misture cookies/host do pages.dev
    out.delete('set-cookie')

    // Reescreve Location absolutos do pages.dev para o domínio admin
    const location = out.get('Location')
    if (location) {
      try {
        const loc = new URL(location, target)
        if (loc.hostname === TARGET_HOST) {
          loc.hostname = incoming.hostname
          out.set('Location', loc.toString())
        }
      } catch {
        /* ignore */
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    })
  },
}
