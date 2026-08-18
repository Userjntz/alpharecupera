import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createMarketingHandler } from './marketing.mjs'
import { createAdminStore } from './admin-store.mjs'
import {
  handleAdminRoutes,
  publicUser as adminPublicUser,
  audit as writeAudit,
} from './admin-routes.mjs'
import {
  normalizeRole,
  canAssignRole,
  hasPermission,
  canSuspendOrArchiveUser,
} from '../shared/admin.ts'
import {
  effectiveUserSlug,
  leadVisibleToCaptador,
  reassignQuizCampaignLeads,
  resolveCaptadorAssignee,
  withPersistedCaptadorSlugs,
} from '../shared/captadorCampaign.ts'
import { toPublicCatalogVehicle } from '../shared/catalog.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'leads.json')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const PORT = Number(process.env.LEADS_API_PORT || 8787)

const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL || 'admin@alpharecupera.com.br'
).trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AlphaRec#Admin2026'
const JWT_SECRET =
  process.env.JWT_SECRET ||
  '59cbd1839f7b855f6677ac66ab7b6e6a16c201831b6ca2684560e7ac3762690c'
const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '1731098261462427'
const QUIZ_URL = process.env.QUIZ_URL || 'https://alpharecupera.com.br'
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7
const PUBLIC_BASE_URL =
  process.env.PUBLIC_API_URL || `http://localhost:${PORT}`

const marketingHandler = createMarketingHandler({
  dataDir: DATA_DIR,
  publicBaseUrl: PUBLIC_BASE_URL,
  env: {
    JWT_SECRET,
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || JWT_SECRET,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    INSTAGRAM_REDIRECT_URI:
      process.env.INSTAGRAM_REDIRECT_URI ||
      `${PUBLIC_BASE_URL}/oauth/instagram/callback`,
    ADMIN_APP_URL: process.env.ADMIN_APP_URL || 'http://127.0.0.1:5174',
  },
})

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8')
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8')

const adminStore = createAdminStore(DATA_DIR)

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return []
  }
}

function writeLeads(leads) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(leads, null, 2), 'utf8')
}

function readUsersRaw() {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    return Array.isArray(users) ? users : []
  } catch {
    return []
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8')
}

function hashPassword(password, saltB64) {
  const salt = saltB64
    ? Buffer.from(saltB64, 'base64url')
    : crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  return {
    hash: hash.toString('base64url'),
    salt: salt.toString('base64url'),
  }
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.password_salt)
  const a = Buffer.from(hash)
  const b = Buffer.from(user.password_hash)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function publicUser(u) {
  return adminPublicUser(u, adminStore.listTeams())
}

function ensureUsers() {
  let users = readUsersRaw()
  if (users.length === 0) {
    const { hash, salt } = hashPassword(ADMIN_PASSWORD)
    users = [
      {
        id: crypto.randomUUID(),
        name: 'Proprietário',
        email: ADMIN_EMAIL,
        role: 'admin',
        status: 'ACTIVE',
        active: true,
        password_hash: hash,
        password_salt: salt,
        created_at: new Date().toISOString(),
      },
    ]
    writeUsers(users)
  }
  users = users.map((u) => ({
    ...u,
    role: normalizeRole(u.role),
    status: u.status || (u.active === false ? 'SUSPENDED' : 'ACTIVE'),
  }))
  const persisted = withPersistedCaptadorSlugs(users)
  if (persisted.changed) {
    users = persisted.users
    writeUsers(users)
  }
  return users
}

function b64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest()
  return `${data}.${b64url(sig)}`
}

function verifyJwt(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const expected = b64url(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
  )
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function send(res, status, body, origin) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  })
  res.end(json)
}

function getAuthUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const payload = verifyJwt(token)
  if (!payload?.email) return null
  if (payload.jti) {
    const session = adminStore.listSessions().find((s) => s.id === payload.jti)
    if (session?.revoked) return null
  }
  const users = ensureUsers()
  const user = users.find((u) => {
    if (u.email !== payload.email) return false
    const status = u.status || (u.active === false ? 'SUSPENDED' : 'ACTIVE')
    return status === 'ACTIVE'
  })
  if (!user) return null
  user.last_activity_at = new Date().toISOString()
  return {
    ...user,
    role: normalizeRole(user.role),
    permissionExtras: user.permissionExtras || [],
  }
}

async function checkPixel() {
  let bundleOk = false
  let pageOk = false
  let detail = 'Não foi possível verificar o Facebook Pixel'
  try {
    const pageRes = await fetch(QUIZ_URL, {
      headers: { 'User-Agent': 'AlphaRecupera-Admin/1.0' },
    })
    pageOk = pageRes.ok
    const html = await pageRes.text()
    const match = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
    if (match) {
      const jsRes = await fetch(new URL(match[0], QUIZ_URL).toString())
      const js = await jsRes.text()
      bundleOk =
        js.includes(FB_PIXEL_ID) ||
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

  const ok = Boolean(FB_PIXEL_ID) && pageOk && bundleOk
  return {
    id: 'facebook_pixel',
    name: 'Facebook Pixel',
    ok,
    status: ok ? 'ok' : bundleOk ? 'parcial' : 'erro',
    detail,
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*'

  if (req.method === 'OPTIONS') {
    send(res, 204, {}, origin)
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    send(
      res,
      200,
      { ok: true, service: 'alpha-recupera-api-local', marketing: true },
      origin,
    )
    return
  }

  if (req.method === 'GET' && url.pathname === '/catalog/vehicles') {
    const q = String(url.searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    let items = adminStore.listCatalog().filter((v) => v && v.published !== false)
    if (q) {
      items = items.filter((v) =>
        [v.marca, v.modelo, v.ano, v.cor, v.cidade, v.estado]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    items.sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1
      }
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
    send(
      res,
      200,
      {
        ok: true,
        vehicles: items.map(toPublicCatalogVehicle),
        total: items.length,
      },
      origin,
    )
    return
  }

  {
    const one = url.pathname.match(/^\/catalog\/vehicles\/([^/]+)$/)
    if (req.method === 'GET' && one) {
      const item = adminStore
        .listCatalog()
        .find((v) => v.id === decodeURIComponent(one[1]))
      if (!item || item.published === false) {
        send(res, 404, { ok: false, error: 'Veículo não encontrado' }, origin)
        return
      }
      send(
        res,
        200,
        { ok: true, vehicle: toPublicCatalogVehicle(item) },
        origin,
      )
      return
    }
  }

  const authUser = getAuthUser(req)
  const marketingAuth = authUser
    ? {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
      }
    : null
  const handled = await marketingHandler(
    req,
    res,
    url,
    marketingAuth,
    (status, body) => send(res, status, body, origin),
  )
  if (handled) return

  if (req.method === 'POST' && url.pathname === '/auth/login') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const body = JSON.parse(raw || '{}')
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      const users = ensureUsers()
      const user = users.find((u) => u.email === email)
      const status = user?.status || (user?.active === false ? 'SUSPENDED' : 'ACTIVE')
      if (!user || status !== 'ACTIVE' || !user.password_hash || !verifyPassword(password, user)) {
        writeAudit(adminStore, null, 'auth.login_failed', 'auth', email, {
          email,
        })
        send(res, 401, { ok: false, error: 'E-mail ou senha inválidos' }, origin)
        return
      }
      const now = Math.floor(Date.now() / 1000)
      const jti = crypto.randomUUID()
      const token = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
        role: normalizeRole(user.role),
        jti,
        iat: now,
        exp: now + TOKEN_TTL_SEC,
      })
      const sessions = adminStore.listSessions()
      sessions.unshift({
        id: jti,
        userId: user.id,
        created_at: new Date().toISOString(),
        expires_at: new Date((now + TOKEN_TTL_SEC) * 1000).toISOString(),
        revoked: false,
        userAgent: req.headers['user-agent'] || '',
        ip: req.socket?.remoteAddress || '',
      })
      adminStore.saveSessions(sessions.slice(0, 2000))
      user.last_activity_at = new Date().toISOString()
      writeUsers(users.map((u) => (u.id === user.id ? user : u)))
      writeAudit(
        adminStore,
        { id: user.id, email: user.email, name: user.name },
        'auth.login',
        'auth',
        user.id,
        {},
      )
      send(res, 200, { ok: true, token, user: publicUser(user) }, origin)
    } catch (e) {
      send(res, 400, { ok: false, error: String(e) }, origin)
    }
    return
  }

  const adminHandled = await handleAdminRoutes({
    req,
    res,
    url,
    origin,
    send: (status, body) => send(res, status, body, origin),
    auth: authUser,
    ensureUsers,
    writeUsers,
    readLeads,
    writeLeads,
    store: adminStore,
    hashPassword,
    verifyPassword,
    signJwt,
    JWT_SECRET,
    TOKEN_TTL_SEC,
  })
  if (adminHandled) return

  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const user = getAuthUser(req)
    if (!user) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    send(res, 200, { ok: true, user: publicUser(user) }, origin)
    return
  }

  if (req.method === 'GET' && url.pathname === '/users') {
    const auth = getAuthUser(req)
    if (!auth) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    if (!hasPermission(auth.role, 'users.view', auth.permissionExtras)) {
      send(res, 403, { ok: false, error: 'Sem permissão' }, origin)
      return
    }
    send(res, 200, { ok: true, users: ensureUsers().map(publicUser) }, origin)
    return
  }

  if (req.method === 'POST' && url.pathname === '/users') {
    const auth = getAuthUser(req)
    if (!auth) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    if (!hasPermission(auth.role, 'users.invite', auth.permissionExtras)) {
      send(res, 403, { ok: false, error: 'Sem permissão' }, origin)
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const body = JSON.parse(raw || '{}')
      const name = String(body.name || '').trim()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      const role = normalizeRole(body.role)
      if (!canAssignRole(auth.role, role)) {
        send(
          res,
          403,
          { ok: false, error: 'Você não pode criar este tipo de conta' },
          origin,
        )
        return
      }
      if (!name || !email || password.length < 8) {
        send(
          res,
          400,
          {
            ok: false,
            error: 'Preencha nome, e-mail e senha (mín. 8 caracteres)',
          },
          origin,
        )
        return
      }
      const users = ensureUsers()
      if (users.some((u) => u.email === email)) {
        send(res, 409, { ok: false, error: 'E-mail já cadastrado' }, origin)
        return
      }
      const { hash, salt } = hashPassword(password)
      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        status: 'ACTIVE',
        active: true,
        password_hash: hash,
        password_salt: salt,
        created_at: new Date().toISOString(),
      }
      users.push(user)
      writeUsers(users)
      writeAudit(adminStore, auth, 'users.create', 'user', user.id, {
        email,
        role,
      })
      send(res, 201, { ok: true, user: publicUser(user) }, origin)
    } catch (e) {
      send(res, 400, { ok: false, error: String(e) }, origin)
    }
    return
  }

  const userMatch = url.pathname.match(/^\/users\/([^/]+)$/)
  if (req.method === 'PATCH' && userMatch) {
    const auth = getAuthUser(req)
    if (!auth) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const id = decodeURIComponent(userMatch[1])
      const body = JSON.parse(raw || '{}')
      const users = ensureUsers()
      const idx = users.findIndex((u) => u.id === id)
      if (idx < 0) {
        send(res, 404, { ok: false, error: 'Usuário não encontrado' }, origin)
        return
      }
      const isSelf = auth.id === id
      const manager = hasPermission(auth.role, 'users.edit', auth.permissionExtras)
      if (!isSelf && !manager) {
        send(res, 403, { ok: false, error: 'Sem permissão' }, origin)
        return
      }
      const next = { ...users[idx] }
      if (typeof body.name === 'string' && body.name.trim()) {
        next.name = body.name.trim()
      }
      if (typeof body.password === 'string' && body.password) {
        if (body.password.length < 8) {
          send(
            res,
            400,
            { ok: false, error: 'Senha deve ter no mínimo 8 caracteres' },
            origin,
          )
          return
        }
        const { hash, salt } = hashPassword(body.password)
        next.password_hash = hash
        next.password_salt = salt
      }
      if (manager && !isSelf) {
        if (body.role) {
          const role = normalizeRole(body.role)
          if (!canAssignRole(auth.role, role)) {
            send(
              res,
              403,
              { ok: false, error: 'Você não pode definir este perfil' },
              origin,
            )
            return
          }
          next.role = role
        }
        if (typeof body.active === 'boolean' || body.status) {
          const check = canSuspendOrArchiveUser(auth.role, next, auth.id, users)
          if (
            (body.active === false ||
              body.status === 'SUSPENDED' ||
              body.status === 'ARCHIVED') &&
            !check.ok
          ) {
            send(res, 400, { ok: false, error: check.error }, origin)
            return
          }
          if (body.status) {
            next.status = body.status
            next.active = body.status === 'ACTIVE'
          } else if (typeof body.active === 'boolean') {
            next.active = body.active
            next.status = body.active ? 'ACTIVE' : 'SUSPENDED'
          }
        }
      }
      users[idx] = next
      writeUsers(users)
      writeAudit(adminStore, auth, 'users.update', 'user', id, {
        role: next.role,
        status: next.status,
      })
      send(res, 200, { ok: true, user: publicUser(next) }, origin)
    } catch (e) {
      send(res, 400, { ok: false, error: String(e) }, origin)
    }
    return
  }

  if (req.method === 'DELETE' && userMatch) {
    const auth = getAuthUser(req)
    if (!auth) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    if (!hasPermission(auth.role, 'users.suspend', auth.permissionExtras)) {
      send(res, 403, { ok: false, error: 'Sem permissão' }, origin)
      return
    }
    const id = decodeURIComponent(userMatch[1])
    const users = ensureUsers()
    const idx = users.findIndex((u) => u.id === id)
    if (idx < 0) {
      send(res, 404, { ok: false, error: 'Usuário não encontrado' }, origin)
      return
    }
    const check = canSuspendOrArchiveUser(auth.role, users[idx], auth.id, users)
    if (!check.ok) {
      send(res, 400, { ok: false, error: check.error }, origin)
      return
    }
    users[idx] = {
      ...users[idx],
      status: 'ARCHIVED',
      active: false,
    }
    writeUsers(users)
    writeAudit(adminStore, auth, 'users.archive', 'user', id, {})
    send(res, 200, { ok: true }, origin)
    return
  }

  if (req.method === 'GET' && url.pathname === '/integrations') {
    const user = getAuthUser(req)
    if (!user) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    const facebook_pixel = await checkPixel()
    const igOk = Boolean(
      process.env.META_APP_ID && process.env.META_APP_SECRET,
    )
    const instagram = {
      id: 'instagram',
      name: 'Instagram (Marketing)',
      ok: igOk,
      status: igOk ? 'ok' : 'erro',
      detail: igOk
        ? 'App Meta configurado — gerencie em Marketing'
        : 'Configure META_APP_ID e META_APP_SECRET',
    }
    send(
      res,
      200,
      { ok: true, integrations: [facebook_pixel, instagram] },
      origin,
    )
    return
  }

  if (req.method === 'GET' && url.pathname === '/leads') {
    const user = getAuthUser(req)
    if (!user) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    let leads = readLeads()
    const users = ensureUsers()
    const repaired = reassignQuizCampaignLeads(leads, users)
    if (repaired.changed) {
      writeLeads(repaired.leads)
      leads = repaired.leads
    }
    leads = leads.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    )
    if (normalizeRole(user.role) === 'captador') {
      const me =
        users.find((u) => u.id === user.id) || {
          id: user.id,
          name: user.name,
          slug: user.slug,
          role: user.role,
          status: 'ACTIVE',
        }
      leads = leads.filter((l) => leadVisibleToCaptador(l, me))
    }
    const q = url.searchParams.get('qualified')
    if (q === 'true') leads = leads.filter((l) => l.qualified)
    if (q === 'false') leads = leads.filter((l) => !l.qualified)
    send(res, 200, { leads }, origin)
    return
  }

  if (req.method === 'POST' && url.pathname === '/leads') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const body = JSON.parse(raw || '{}')
      let lead = {
        ...body,
        id: body.id || crypto.randomUUID(),
        created_at: body.created_at || new Date().toISOString(),
        status: body.status || 'aberto',
      }
      const leads = readLeads()
      const idx = leads.findIndex((l) => l.id === lead.id)
      const keepExisting = idx >= 0 && leads[idx].assigneeId
      const keepProvided = Boolean(lead.assigneeId)
      if (lead.origem === 'manual') {
        const auth = getAuthUser(req)
        if (!auth) {
          send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
          return
        }
        lead.assigneeId = auth.id
        lead.assigneeName = auth.name
        lead.captadorSlug = effectiveUserSlug(auth)
        lead.createdById = auth.id
        lead.status = lead.status || 'aberto'
      } else if (keepExisting) {
        lead.assigneeId = leads[idx].assigneeId
        lead.assigneeName = leads[idx].assigneeName
        lead.captadorSlug = leads[idx].captadorSlug
      } else if (!keepProvided) {
        const users = ensureUsers()
        const assigned = resolveCaptadorAssignee(users, lead.captadorSlug || '')
        lead.captadorSlug = assigned.slug
        if (assigned.user) {
          lead.assigneeId = assigned.user.id
          lead.assigneeName = assigned.user.name
        }
      }
      if (idx >= 0) leads[idx] = lead
      else leads.push(lead)
      writeLeads(leads)
      send(res, 201, { ok: true, lead }, origin)
    } catch (e) {
      send(res, 400, { ok: false, error: String(e) })
    }
    return
  }

  const patchMatch = url.pathname.match(/^\/leads\/([^/]+)$/)
  if (req.method === 'PATCH' && patchMatch) {
    const user = getAuthUser(req)
    if (!user) {
      send(res, 401, { ok: false, error: 'Não autenticado' }, origin)
      return
    }
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      const id = decodeURIComponent(patchMatch[1])
      const body = JSON.parse(raw || '{}')
      const leads = readLeads()
      const idx = leads.findIndex((l) => l.id === id)
      if (idx < 0) {
        send(res, 404, { ok: false, error: 'Lead não encontrado' }, origin)
        return
      }
      const next = {
        ...leads[idx],
        ...body,
        id: leads[idx].id,
        created_at: leads[idx].created_at,
      }
      leads[idx] = next
      writeLeads(leads)
      send(res, 200, { ok: true, lead: next }, origin)
    } catch (e) {
      send(res, 400, { ok: false, error: String(e) }, origin)
    }
    return
  }

  send(res, 404, { error: 'Not found' }, origin)
})

server.listen(PORT, '0.0.0.0', () => {
  ensureUsers()
  console.log(`Leads API em http://localhost:${PORT}`)
  console.log(`Admin login: ${ADMIN_EMAIL}`)
})
