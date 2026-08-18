import {
  handleMarketingRequest,
  runMarketingCron,
} from './marketing/routes'
import {
  handleAdminWorker,
  createAdminKvStore,
} from './admin/routes'
import { handlePublicCatalog } from './catalog/public'
import { putIfChanged } from './lib/kvWrite'
import { wrapDurableKv } from './lib/durableKv'
import {
  normalizeRole as sharedNormalizeRole,
  canAssignRole as sharedCanAssignRole,
  hasPermission,
  canSuspendOrArchiveUser,
  type UserRole as SharedUserRole,
} from '../../../shared/admin'
import {
  effectiveUserSlug,
  leadVisibleToCaptador,
  reassignQuizCampaignLeads,
  resolveCaptadorAssignee,
  slugFromUserName,
  uniqueCaptadorSlug,
  withPersistedCaptadorSlugs,
} from '../../../shared/captadorCampaign'

export interface Env {
  LEADS_KV: KVNamespace
  DB?: D1Database
  MEDIA_R2?: R2Bucket
  ADMIN_EMAIL: string
  ADMIN_PASSWORD: string
  JWT_SECRET: string
  FB_PIXEL_ID?: string
  FB_ACCESS_TOKEN?: string
  QUIZ_URL?: string
  TOKEN_ENCRYPTION_KEY?: string
  META_APP_ID?: string
  META_APP_SECRET?: string
  INSTAGRAM_REDIRECT_URI?: string
  META_GRAPH_VERSION?: string
  MEDIA_PUBLIC_BASE_URL?: string
  PUBLIC_API_URL?: string
  ADMIN_APP_URL?: string
  META_WEBHOOK_VERIFY_TOKEN?: string
  APP_VERSION?: string
}

type Lead = Record<string, unknown> & {
  id: string
  created_at: string
  qualified?: boolean
}

type UserRole = SharedUserRole

function normalizeRole(role: unknown): UserRole {
  return sharedNormalizeRole(typeof role === 'string' ? role : null)
}

function canManageUsers(role: UserRole) {
  return hasPermission(role, 'users.view')
}

function canAssignRole(actor: UserRole, target: UserRole) {
  return sharedCanAssignRole(actor, target)
}

type UserRecord = {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  status?: string
  password_hash: string
  password_salt: string
  created_at: string
  permissionExtras?: string[]
  last_activity_at?: string
  teamId?: string | null
  managerId?: string | null
  slug?: string
}

type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
  slug?: string
}

const LEADS_KEY = 'leads:all'
const USERS_KEY = 'users:all'
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7

const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'https://alpharecupera.com.br',
  'https://www.alpharecupera.com.br',
  'https://admin.alpharecupera.com.br',
  'https://quiz.alpharecupera.com.br',
  'https://catalogo.alpharecupera.com.br',
  'https://catalogo.alpharecupera.com',
  'https://hub.alpharecupera.com.br',
  'https://alpharecupera-admin.pages.dev',
  'https://alpharecupera-quiz.pages.dev',
  'https://alpharecupera-catalogo.pages.dev',
  'https://alpharecupera-hub.pages.dev',
]

function corsHeaders(origin: string | null): HeadersInit {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

function json(
  data: unknown,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      ...corsHeaders(origin),
    },
  })
}

function publicUser(u: UserRecord) {
  const status =
    u.status || (u.active === false ? 'SUSPENDED' : 'ACTIVE')
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: normalizeRole(u.role),
    status,
    active: status === 'ACTIVE',
    permissionExtras: u.permissionExtras || [],
    created_at: u.created_at,
    last_activity_at: u.last_activity_at || null,
    slug: effectiveUserSlug(u),
  }
}

function b64url(bytes: ArrayBuffer | Uint8Array | string): string {
  let bin: string
  if (typeof bytes === 'string') {
    bin = btoa(bytes)
  } else {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let s = ''
    for (const b of arr) s += String.fromCharCode(b)
    bin = btoa(s)
  }
  return bin.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data),
  )
  return `${data}.${b64url(sig)}`
}

async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const key = await hmacKey(secret)
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    fromB64url(sig),
    new TextEncoder().encode(`${header}.${body}`),
  )
  if (!ok) return null
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(body)),
    ) as Record<string, unknown>
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a)
  const be = new TextEncoder().encode(b)
  if (ae.length !== be.length) return false
  let out = 0
  for (let i = 0; i < ae.length; i++) out |= ae[i] ^ be[i]
  return out === 0
}

async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64
    ? fromB64url(saltB64)
    : crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return { hash: b64url(bits), salt: b64url(salt) }
}

async function verifyPassword(password: string, user: UserRecord) {
  const { hash } = await hashPassword(password, user.password_salt)
  return timingSafeEqual(hash, user.password_hash)
}

async function readUsers(env: Env): Promise<UserRecord[]> {
  const raw = await env.LEADS_KV.get(USERS_KEY)
  if (!raw) return []
  try {
    const users = JSON.parse(raw) as UserRecord[]
    return Array.isArray(users) ? users : []
  } catch {
    return []
  }
}

async function writeUsers(env: Env, users: UserRecord[]) {
  await putIfChanged(env.LEADS_KV, USERS_KEY, JSON.stringify(users))
}

async function ensureUsers(env: Env): Promise<UserRecord[]> {
  let users = await readUsers(env)
  if (users.length === 0) {
    const email = (env.ADMIN_EMAIL || '').trim().toLowerCase()
    const password = env.ADMIN_PASSWORD || ''
    if (!email || !password) return []

    const { hash, salt } = await hashPassword(password)
    const admin: UserRecord = {
      id: crypto.randomUUID(),
      name: 'Proprietário',
      email,
      role: 'admin',
      status: 'ACTIVE',
      active: true,
      password_hash: hash,
      password_salt: salt,
      created_at: new Date().toISOString(),
      slug: uniqueCaptadorSlug(slugFromUserName('Proprietário') || 'admin', []),
    }
    users = [admin]
    await writeUsers(env, users)
  }
  const persisted = withPersistedCaptadorSlugs(users)
  if (persisted.changed) {
    users = persisted.users as UserRecord[]
    await writeUsers(env, users)
  }
  return users
}

async function requireAuth(
  req: Request,
  env: Env,
): Promise<AuthUser | Response> {
  const origin = req.headers.get('Origin')
  const header = req.headers.get('Authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !env.JWT_SECRET) {
    return json({ ok: false, error: 'Não autenticado' }, 401, origin)
  }
  const payload = await verifyJwt(token, env.JWT_SECRET)
  if (!payload || typeof payload.email !== 'string') {
    return json({ ok: false, error: 'Sessão inválida' }, 401, origin)
  }

  if (typeof payload.jti === 'string') {
    const store = createAdminKvStore(env.LEADS_KV)
    const sessions = await store.listSessions()
    const session = sessions.find(
      (s) => (s as { id?: string }).id === payload.jti,
    ) as { revoked?: boolean } | undefined
    if (session?.revoked) {
      return json({ ok: false, error: 'Sessão revogada' }, 401, origin)
    }
  }

  const users = await ensureUsers(env)
  const user = users.find((u) => {
    if (u.email !== payload.email) return false
    const status = u.status || (u.active === false ? 'SUSPENDED' : 'ACTIVE')
    return status === 'ACTIVE'
  })
  if (!user) {
    return json({ ok: false, error: 'Conta inativa ou inexistente' }, 401, origin)
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
    permissionExtras: (user.permissionExtras || []) as never,
    slug: effectiveUserSlug(user),
  }
}

function requireTeamManager(auth: AuthUser, origin: string | null) {
  if (!canManageUsers(auth.role)) {
    return json({ ok: false, error: 'Sem permissão' }, 403, origin)
  }
  return null
}

async function readLeads(env: Env): Promise<Lead[]> {
  const raw = await env.LEADS_KV.get(LEADS_KEY)
  if (!raw) return []
  try {
    const leads = JSON.parse(raw) as Lead[]
    return Array.isArray(leads) ? leads : []
  } catch {
    return []
  }
}

function mergeLeadSnapshots(base: Lead[], incoming: Lead[]): Lead[] {
  const map = new Map<string, Lead>()
  for (const l of base) {
    if (l?.id) map.set(String(l.id), l)
  }
  for (const l of incoming) {
    if (!l?.id) continue
    const id = String(l.id)
    const prev = map.get(id)
    map.set(id, prev ? { ...prev, ...l, id: prev.id } : l)
  }
  return [...map.values()]
}

async function writeLeads(env: Env, leads: Lead[]) {
  const latest = await readLeads(env)
  const merged = mergeLeadSnapshots(latest, leads)
  await putIfChanged(env.LEADS_KV, LEADS_KEY, JSON.stringify(merged))
}

async function assignQuizCaptador(env: Env, lead: Lead): Promise<Lead> {
  const users = await ensureUsers(env)
  const requested = String(lead.captadorSlug || '')
  const { slug, user } = resolveCaptadorAssignee(users, requested)
  lead.captadorSlug = slug
  if (user) {
    lead.assigneeId = user.id
    lead.assigneeName = user.name
  }
  return lead
}

async function checkPixel(env: Env) {
  const pixelId = env.FB_PIXEL_ID || '1731098261462427'
  const quizUrl = env.QUIZ_URL || 'https://alpharecupera.com.br'
  let bundleOk = false
  let pageOk = false
  let detail = 'Não foi possível verificar o Facebook Pixel'

  try {
    const pageRes = await fetch(quizUrl, {
      headers: { 'User-Agent': 'AlphaRecupera-Admin/1.0' },
    })
    pageOk = pageRes.ok
    const html = await pageRes.text()
    const match = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
    if (match) {
      const jsRes = await fetch(new URL(match[0], quizUrl).toString())
      const js = await jsRes.text()
      bundleOk =
        js.includes(pixelId) ||
        js.includes('fbevents.js') ||
        js.includes('fbq(') ||
        js.includes('connect.facebook.net')
      detail = bundleOk
        ? 'Pixel do Facebook funcionando no quiz'
        : 'Quiz online, mas o Pixel não foi detectado'
    } else {
      detail = pageOk
        ? 'Quiz online, verificação incompleta'
        : 'Não foi possível acessar o quiz'
    }
  } catch {
    detail = 'Falha ao verificar o Pixel'
  }

  const ok = Boolean(pixelId) && pageOk && bundleOk
  return {
    id: 'facebook_pixel',
    name: 'Facebook Pixel',
    ok,
    status: ok ? 'ok' : bundleOk ? 'parcial' : 'erro',
    detail,
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    try {
      const kv = wrapDurableKv(env.DB, env.LEADS_KV)
      return await handleRequest(
        req,
        { ...env, LEADS_KV: kv as KVNamespace },
        origin,
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('Worker uncaught:', message, e)
      return json(
        { ok: false, error: message || 'Falha interna' },
        500,
        origin,
      )
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    const kv = wrapDurableKv(env.DB, env.LEADS_KV)
    await runMarketingCron({ ...env, LEADS_KV: kv as KVNamespace })
  },
}

async function handleRequest(
  req: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(req.url)

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(
        {
          ok: true,
          service: 'alpha-recupera-api',
          marketing: true,
        },
        200,
        origin,
      )
    }

    try {
      const marketingRes = await handleMarketingRequest({
        req,
        env,
        url,
        origin,
        auth: null,
        json,
        requireAuth: async () => requireAuth(req, env),
      })
      if (marketingRes) return marketingRes
    } catch (e) {
      console.error('Marketing handler:', e)
      if (
        url.pathname.startsWith('/marketing') ||
        url.pathname.startsWith('/oauth/instagram')
      ) {
        return json(
          {
            ok: false,
            error: e instanceof Error ? e.message : 'Falha no marketing',
          },
          500,
          origin,
        )
      }
    }

    try {
      const catalogRes = await handlePublicCatalog({
        req,
        url,
        origin,
        env,
        json,
      })
      if (catalogRes) return catalogRes
    } catch (e) {
      console.error('Catalog handler:', e)
      if (url.pathname.startsWith('/catalog')) {
        return json(
          {
            ok: false,
            error: e instanceof Error ? e.message : 'Falha no catálogo',
          },
          500,
          origin,
        )
      }
    }

    if (url.pathname.startsWith('/admin')) {
      const isPublicAdmin =
        (url.pathname === '/admin/invites/accept' && req.method === 'POST') ||
        (req.method === 'GET' &&
          /^\/admin\/cv\/documents\/file\/[^/]+$/.test(url.pathname))
      const authForAdmin = isPublicAdmin
        ? null
        : await requireAuth(req, env)
      if (authForAdmin instanceof Response) return authForAdmin
      try {
        const adminRes = await handleAdminWorker({
          req,
          url,
          origin,
          env,
          auth: authForAdmin,
          json,
          ensureUsers: () => ensureUsers(env),
          writeUsers: (users) => writeUsers(env, users as UserRecord[]),
          readLeads: () => readLeads(env),
          writeLeads: (leads) => writeLeads(env, leads as Lead[]),
          hashPassword,
          signJwt,
          jwtSecret: env.JWT_SECRET,
          tokenTtl: TOKEN_TTL_SEC,
        })
        if (adminRes) return adminRes
      } catch (e) {
        return json(
          {
            ok: false,
            error:
              e instanceof Error
                ? e.message
                : 'Falha interna no painel admin',
          },
          500,
          origin,
        )
      }
    }

    if (req.method === 'POST' && url.pathname === '/auth/login') {
      try {
        const body = (await req.json()) as { email?: string; password?: string }
        const email = (body.email || '').trim().toLowerCase()
        const password = body.password || ''
        if (!email || !password) {
          return json({ ok: false, error: 'E-mail ou senha inválidos' }, 401, origin)
        }
        if (!env.JWT_SECRET) {
          return json({ ok: false, error: 'Serviço indisponível' }, 503, origin)
        }

        const users = await ensureUsers(env)
        const user = users.find((u) => u.email === email)
        const status =
          user?.status || (user?.active === false ? 'SUSPENDED' : 'ACTIVE')
        if (!user || status !== 'ACTIVE' || !user.password_hash) {
          return json({ ok: false, error: 'E-mail ou senha inválidos' }, 401, origin)
        }
        const valid = await verifyPassword(password, user)
        if (!valid) {
          return json({ ok: false, error: 'E-mail ou senha inválidos' }, 401, origin)
        }

        const now = Math.floor(Date.now() / 1000)
        const jti = crypto.randomUUID()
        const token = await signJwt(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            role: normalizeRole(user.role),
            jti,
            iat: now,
            exp: now + TOKEN_TTL_SEC,
          },
          env.JWT_SECRET,
        )
        const store = createAdminKvStore(env.LEADS_KV)
        const sessions = await store.listSessions()
        sessions.unshift({
          id: jti,
          userId: user.id,
          created_at: new Date().toISOString(),
          expires_at: new Date((now + TOKEN_TTL_SEC) * 1000).toISOString(),
          revoked: false,
        })
        try {
          await store.saveSessions(sessions.slice(0, 2000))
        } catch (e) {
          console.warn('session persist skipped:', e)
        }
        return json(
          {
            ok: true,
            token,
            user: { ...publicUser(user), role: normalizeRole(user.role) },
          },
          200,
          origin,
        )
      } catch {
        return json({ ok: false, error: 'JSON inválido' }, 400, origin)
      }
    }

    if (req.method === 'GET' && url.pathname === '/auth/me') {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      return json({ ok: true, user: auth }, 200, origin)
    }

    if (req.method === 'GET' && url.pathname === '/users') {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      if (!hasPermission(auth.role, 'users.view')) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const users = await ensureUsers(env)
      return json(
        {
          ok: true,
          users: users.map((u) => ({
            ...publicUser(u),
            role: normalizeRole(u.role),
          })),
        },
        200,
        origin,
      )
    }

    if (req.method === 'POST' && url.pathname === '/users') {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      const denied = requireTeamManager(auth, origin)
      if (denied) return denied
      try {
        const body = (await req.json()) as {
          name?: string
          email?: string
          password?: string
          role?: UserRole
        }
        const name = (body.name || '').trim()
        const email = (body.email || '').trim().toLowerCase()
        const password = body.password || ''
        const role = normalizeRole(body.role)

        if (!canAssignRole(auth.role, role)) {
          return json(
            { ok: false, error: 'Você não pode criar este tipo de conta' },
            403,
            origin,
          )
        }

        if (!name || !email || password.length < 6) {
          return json(
            {
              ok: false,
              error: 'Preencha nome, e-mail e senha (mín. 6 caracteres)',
            },
            400,
            origin,
          )
        }

        const users = await ensureUsers(env)
        if (users.some((u) => u.email === email)) {
          return json({ ok: false, error: 'E-mail já cadastrado' }, 409, origin)
        }

        const { hash, salt } = await hashPassword(password)
        const user: UserRecord = {
          id: crypto.randomUUID(),
          name,
          email,
          role,
          active: true,
          password_hash: hash,
          password_salt: salt,
          created_at: new Date().toISOString(),
          slug: uniqueCaptadorSlug(slugFromUserName(name), users),
        }
        users.push(user)
        await writeUsers(env, users)
        return json({ ok: true, user: publicUser(user) }, 201, origin)
      } catch {
        return json({ ok: false, error: 'JSON inválido' }, 400, origin)
      }
    }

    const userPatch = url.pathname.match(/^\/users\/([^/]+)$/)
    if (req.method === 'PATCH' && userPatch) {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      try {
        const id = decodeURIComponent(userPatch[1])
        const body = (await req.json()) as {
          name?: string
          password?: string
          role?: UserRole
          active?: boolean
        }
        const users = await ensureUsers(env)
        const idx = users.findIndex((u) => u.id === id)
        if (idx < 0) {
          return json({ ok: false, error: 'Usuário não encontrado' }, 404, origin)
        }

        const isSelf = auth.id === id
        const manager = canManageUsers(auth.role)
        if (!isSelf && !manager) {
          return json({ ok: false, error: 'Sem permissão' }, 403, origin)
        }

        const current = users[idx]
        const next: UserRecord = { ...current }

        if (typeof body.name === 'string' && body.name.trim()) {
          next.name = body.name.trim()
        }

        if (typeof body.password === 'string' && body.password) {
          if (body.password.length < 6) {
            return json(
              { ok: false, error: 'Senha deve ter no mínimo 6 caracteres' },
              400,
              origin,
            )
          }
          const { hash, salt } = await hashPassword(body.password)
          next.password_hash = hash
          next.password_salt = salt
        }

        if (manager && !isSelf) {
          if (body.role) {
            const role = normalizeRole(body.role)
            if (!canAssignRole(auth.role, role)) {
              return json(
                { ok: false, error: 'Você não pode definir este perfil' },
                403,
                origin,
              )
            }
            next.role = role
          }
          if (typeof body.active === 'boolean') {
            next.active = body.active
          }
        }

        users[idx] = next
        await writeUsers(env, users)
        return json(
          {
            ok: true,
            user: { ...publicUser(next), role: normalizeRole(next.role) },
          },
          200,
          origin,
        )
      } catch {
        return json({ ok: false, error: 'JSON inválido' }, 400, origin)
      }
    }

    if (req.method === 'DELETE' && userPatch) {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      if (!hasPermission(auth.role, 'users.suspend')) {
        return json({ ok: false, error: 'Sem permissão' }, 403, origin)
      }
      const id = decodeURIComponent(userPatch[1])
      const users = await ensureUsers(env)
      const idx = users.findIndex((u) => u.id === id)
      if (idx < 0) {
        return json({ ok: false, error: 'Usuário não encontrado' }, 404, origin)
      }
      const check = canSuspendOrArchiveUser(
        auth.role,
        users[idx],
        auth.id,
        users,
      )
      if (!check.ok) {
        return json({ ok: false, error: check.error }, 400, origin)
      }
      users[idx] = {
        ...users[idx],
        status: 'ARCHIVED',
        active: false,
      }
      await writeUsers(env, users)
      return json({ ok: true }, 200, origin)
    }

    if (req.method === 'GET' && url.pathname === '/integrations') {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      const facebook_pixel = await checkPixel(env)
      const igConfigured = Boolean(
        env.META_APP_ID && env.META_APP_SECRET && env.INSTAGRAM_REDIRECT_URI,
      )
      const instagram = {
        id: 'instagram',
        name: 'Instagram (Marketing)',
        ok: igConfigured,
        status: igConfigured ? 'ok' : 'erro',
        detail: igConfigured
          ? 'App Meta configurado — gerencie em Marketing'
          : 'Configure META_APP_ID, META_APP_SECRET e INSTAGRAM_REDIRECT_URI',
      }
      return json(
        { ok: true, integrations: [facebook_pixel, instagram] },
        200,
        origin,
      )
    }

    if (req.method === 'GET' && url.pathname === '/leads') {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      const users = await ensureUsers(env)
      let leads = await readLeads(env)
      const repaired = reassignQuizCampaignLeads(leads, users)
      if (repaired.changed) {
        await writeLeads(env, repaired.leads)
        leads = await readLeads(env)
      } else {
        leads = repaired.leads
      }
      leads = leads.sort(
        (a, b) =>
          new Date(String(b.created_at)).getTime() -
          new Date(String(a.created_at)).getTime(),
      )
      if (normalizeRole(auth.role) === 'captador') {
        const me =
          users.find((u) => u.id === auth.id) ||
          ({
            id: auth.id,
            name: auth.name,
            slug: auth.slug,
            role: auth.role,
            status: 'ACTIVE',
            active: true,
          } as UserRecord)
        leads = leads.filter((l) => leadVisibleToCaptador(l, me))
      }
      const q = url.searchParams.get('qualified')
      if (q === 'true') leads = leads.filter((l) => l.qualified === true)
      if (q === 'false') leads = leads.filter((l) => l.qualified === false)
      return json({ leads }, 200, origin)
    }

    if (req.method === 'POST' && url.pathname === '/leads') {
      try {
        const body = (await req.json()) as Partial<Lead>
        let lead: Lead = {
          ...body,
          id: body.id || crypto.randomUUID(),
          created_at: body.created_at || new Date().toISOString(),
          status: body.status || 'aberto',
        }
        const leads = await readLeads(env)
        const idx = leads.findIndex((l) => l.id === lead.id)
        const keepExisting = idx >= 0 && Boolean(leads[idx].assigneeId)
        const keepProvided = Boolean(lead.assigneeId)
        if (lead.origem === 'manual') {
          const auth = await requireAuth(req, env)
          if (auth instanceof Response) return auth
          lead.assigneeId = auth.id
          lead.assigneeName = auth.name
          lead.captadorSlug = auth.slug || lead.captadorSlug
          lead.createdById = auth.id
          lead.status = lead.status || 'aberto'
        } else if (keepExisting) {
          lead.assigneeId = leads[idx].assigneeId
          lead.assigneeName = leads[idx].assigneeName
          lead.captadorSlug = leads[idx].captadorSlug
        } else if (!keepProvided) {
          lead = await assignQuizCaptador(env, lead)
        }
        if (idx >= 0) leads[idx] = { ...leads[idx], ...lead }
        else leads.push(lead)
        await writeLeads(env, leads)
        const saved = (await readLeads(env)).find((l) => l.id === lead.id) || lead
        return json({ ok: true, lead: saved }, 201, origin)
      } catch (e) {
        return json({ ok: false, error: String(e) }, 400, origin)
      }
    }

    // Upload público de fotos do carro (quiz) — sem auth
    if (req.method === 'POST' && url.pathname === '/leads/photos') {
      try {
        const form = await req.formData()
        const file = form.get('file')
        const blob =
          typeof file === 'object' &&
          file !== null &&
          typeof (file as Blob).arrayBuffer === 'function'
            ? (file as Blob)
            : null
        if (!blob || !blob.size) {
          return json({ ok: false, error: 'Arquivo obrigatório' }, 400, origin)
        }
        if (blob.size > 5 * 1024 * 1024) {
          return json(
            { ok: false, error: 'Foto muito grande (máx. 5MB)' },
            400,
            origin,
          )
        }
        const buf = new Uint8Array(await blob.arrayBuffer())
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
        const isPng =
          buf[0] === 0x89 &&
          buf[1] === 0x50 &&
          buf[2] === 0x4e &&
          buf[3] === 0x47
        if (!isJpeg && !isPng) {
          return json(
            { ok: false, error: 'Use JPG ou PNG' },
            400,
            origin,
          )
        }
        const id = crypto.randomUUID()
        const mime = isPng ? 'image/png' : 'image/jpeg'
        const storageKey = `kv:lead:photo:${id}`
        await env.LEADS_KV.put(storageKey, buf, {
          expirationTtl: 60 * 60 * 24 * 180,
          metadata: { mime },
        })
        const apiBase = (
          env.PUBLIC_API_URL ||
          url.origin
        ).replace(/\/$/, '')
        const photoUrl = `${apiBase}/leads/photos/file/${id}`
        return json(
          { ok: true, photo: { id, url: photoUrl, mime } },
          201,
          origin,
        )
      } catch (e) {
        return json(
          { ok: false, error: e instanceof Error ? e.message : 'Falha no upload' },
          400,
          origin,
        )
      }
    }

    const leadPhotoFile = url.pathname.match(
      /^\/leads\/photos\/file\/([^/]+)$/,
    )
    if (req.method === 'GET' && leadPhotoFile) {
      const id = decodeURIComponent(leadPhotoFile[1])
      const storageKey = `kv:lead:photo:${id}`
      const obj = await env.LEADS_KV.getWithMetadata<{ mime?: string }>(
        storageKey,
        'arrayBuffer',
      )
      if (!obj.value) {
        return json({ ok: false, error: 'Foto não encontrada' }, 404, origin)
      }
      return new Response(obj.value, {
        status: 200,
        headers: {
          'Content-Type': obj.metadata?.mime || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const patchMatch = url.pathname.match(/^\/leads\/([^/]+)$/)
    if (req.method === 'PATCH' && patchMatch) {
      const auth = await requireAuth(req, env)
      if (auth instanceof Response) return auth
      try {
        const id = decodeURIComponent(patchMatch[1])
        const body = (await req.json()) as Partial<Lead>
        const leads = await readLeads(env)
        const idx = leads.findIndex((l) => l.id === id)
        if (idx < 0) {
          return json({ ok: false, error: 'Lead não encontrado' }, 404, origin)
        }
        const next: Lead = {
          ...leads[idx],
          ...body,
          id: leads[idx].id,
          created_at: leads[idx].created_at,
        }
        leads[idx] = next
        await writeLeads(env, leads)
        return json({ ok: true, lead: next }, 200, origin)
      } catch (e) {
        return json({ ok: false, error: String(e) }, 400, origin)
      }
    }

    return json({ error: 'Not found' }, 404, origin)
}
