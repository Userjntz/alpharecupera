/**
 * Rotas admin no Cloudflare Worker (KV).
 * Espelha a API local em server/admin-routes.mjs.
 */
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  PERMISSION_CATEGORIES,
  canAssignRole,
  canSuspendOrArchiveUser,
  hasPermission,
  normalizeRole,
  normalizePermissionExtras,
  permissionsForRole,
  sanitizeAuditMeta,
  parsePageParams,
  paginate,
  maskPhone,
  LEAD_PIPELINE_STAGES,
  type Permission,
  type UserRole,
} from '../../../../shared/admin'
import {
  campaignQuizUrl,
  effectiveUserSlug,
  slugFromUserName,
  slugifyCaptador,
  uniqueCaptadorSlug,
} from '../../../../shared/captadorCampaign'
import {
  createAdminKvStore,
  newInviteToken,
  sha256Base64Url,
  type AdminKvStore,
} from './store'
import {
  sanitizeCatalogInput,
  type CatalogVehicleRecord,
} from '../../../../shared/catalog'
import {
  makeCvId,
  normalizeCvStatus,
  sanitizeCvInput,
  type CvDeal,
  type CvDocument,
  type CvDocumentKind,
} from '../../../../shared/cv'
import {
  isNoticeVisible,
  makeAgendaId,
  sanitizeAgendaEvent,
  sanitizeNotice,
  type AgendaEvent,
  type PanelNotice,
} from '../../../../shared/agenda'
import { createAgendaRepo, type AgendaDb } from './agendaRepo'
import {
  makePaymentId,
  sanitizePaymentInput,
  sumPayments,
  syncPaymentsFromDeals,
  type PaymentRecord,
} from '../../../../shared/payments'

type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
  permissionExtras?: Permission[]
}

type UserRecord = {
  id: string
  name: string
  email: string
  role: UserRole | string
  active?: boolean
  status?: string
  password_hash?: string
  password_salt?: string
  created_at: string
  teamId?: string | null
  managerId?: string | null
  permissionExtras?: Permission[]
  last_activity_at?: string | null
  invited_at?: string | null
  inviteId?: string
  slug?: string
}

type JsonFn = (
  data: unknown,
  status?: number,
  origin?: string | null,
) => Response

function accountStatus(user: UserRecord) {
  if (user.status) return user.status
  if (user.active === false) return 'SUSPENDED'
  return 'ACTIVE'
}

function publicUser(u: UserRecord, teams: Record<string, unknown>[] = []) {
  const team = teams.find((t) =>
    ((t.memberIds as string[]) || []).includes(u.id),
  ) as { id?: string; name?: string } | undefined
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: normalizeRole(u.role),
    status: accountStatus(u),
    active: accountStatus(u) === 'ACTIVE',
    teamId: u.teamId || team?.id || null,
    teamName: team?.name || null,
    managerId: u.managerId || null,
    permissionExtras: u.permissionExtras || [],
    last_activity_at: u.last_activity_at || null,
    created_at: u.created_at,
    invited_at: u.invited_at || null,
    mfa_enabled: false,
    slug: effectiveUserSlug(u),
    campaignUrl: campaignQuizUrl(effectiveUserSlug(u)),
  }
}

function effectivePermissions(user: UserRecord) {
  const role = normalizeRole(user.role)
  const extras = user.permissionExtras || []
  return [...new Set([...permissionsForRole(role), ...extras])]
}

async function audit(
  store: AdminKvStore,
  auth: AuthUser | null,
  action: string,
  resource: string,
  resourceId: string | null,
  meta?: Record<string, unknown>,
) {
  try {
    await store.appendAudit({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actorId: auth?.id || null,
      actorEmail: auth?.email || null,
      actorName: auth?.name || null,
      action,
      resource,
      resourceId,
      correlationId: crypto.randomUUID(),
      meta: sanitizeAuditMeta(meta) || {},
    })
  } catch {
    /* auditoria não pode derrubar a operação principal (ex.: cota KV) */
  }
}

function deny(json: JsonFn, origin: string | null) {
  return json({ ok: false, error: 'Sem permissão' }, 403, origin)
}

function requirePerm(
  auth: AuthUser,
  permission: Permission,
  json: JsonFn,
  origin: string | null,
) {
  if (!hasPermission(auth.role, permission, auth.permissionExtras || [])) {
    return deny(json, origin)
  }
  return null
}

export async function handleAdminWorker(ctx: {
  req: Request
  url: URL
  origin: string | null
  env: {
    LEADS_KV: KVNamespace
    DB?: AgendaDb
    ADMIN_APP_URL?: string
    APP_VERSION?: string
    PUBLIC_API_URL?: string
  }
  auth: AuthUser | null
  json: JsonFn
  ensureUsers: () => Promise<UserRecord[]>
  writeUsers: (users: UserRecord[]) => Promise<void>
  readLeads: () => Promise<Record<string, unknown>[]>
  writeLeads: (leads: Record<string, unknown>[]) => Promise<void>
  hashPassword: (
    password: string,
    salt?: string,
  ) => Promise<{ hash: string; salt: string }>
  signJwt: (payload: Record<string, unknown>, secret: string) => Promise<string>
  jwtSecret: string
  tokenTtl: number
}): Promise<Response | null> {
  const { req, url, origin, env, auth, json } = ctx
  const p = url.pathname
  if (!p.startsWith('/admin')) return null

  const store = createAdminKvStore(env.LEADS_KV)
  const agenda = env.DB
    ? createAgendaRepo(env.DB, env.LEADS_KV)
    : null

  if (p === '/admin/meta' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const teams = await store.listTeams()
    return json(
      {
        ok: true,
        roles: ALL_ROLES.map((id) => ({
          id,
          label: ROLE_LABELS[id],
          description: ROLE_DESCRIPTIONS[id],
          permissions: permissionsForRole(id),
        })),
        permissions: ALL_PERMISSIONS,
        categories: PERMISSION_CATEGORIES,
        pipeline: LEAD_PIPELINE_STAGES,
        me: {
          ...publicUser(auth as unknown as UserRecord, teams),
          permissions: effectivePermissions(auth as unknown as UserRecord),
        },
      },
      200,
      origin,
    )
  }

  if (p === '/admin/dashboard' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'admin.dashboard.view', json, origin)
    if (denied) return denied
    const leads = await ctx.readLeads()
    const users = await ctx.ensureUsers()
    const evaluations = await store.listEvaluations()
    const acquisitions = await store.listAcquisitions()
    const inventory = await store.listInventory()
    const sales = await store.listSales()
    const canFinance = hasPermission(auth.role, 'finance.view_summary')
    const open = leads.filter((l) => l.status !== 'finalizado')
    return json(
      {
        ok: true,
        period: url.searchParams.get('period') || '30d',
        updatedAt: new Date().toISOString(),
        kpis: {
          newLeads: leads.length,
          waitingService: open.filter((l) => !l.contacted_at).length,
          unassigned: open.filter((l) => !l.assigneeId).length,
          avgFirstTouchMinutes: null,
          qualified: leads.filter((l) => l.qualified).length,
          vehiclesAwaitingEval: 0,
          evaluationsPending: evaluations.filter(
            (e) => (e as { status?: string }).status === 'PENDENTE',
          ).length,
          proposalsSent: acquisitions.filter(
            (a) => (a as { stage?: string }).stage === 'PROPOSTA_ENVIADA',
          ).length,
          proposalsAccepted: acquisitions.filter(
            (a) => (a as { stage?: string }).stage === 'APROVADO',
          ).length,
          proposalsRejected: acquisitions.filter(
            (a) => (a as { stage?: string }).stage === 'RECUSADO',
          ).length,
          vehiclesBought: acquisitions.filter(
            (a) => (a as { stage?: string }).stage === 'COMPRADO',
          ).length,
          inStock: inventory.length,
          reserved: inventory.filter(
            (i) => (i as { status?: string }).status === 'RESERVADO',
          ).length,
          sold: sales.filter(
            (s) => (s as { status?: string }).status === 'COMPLETED',
          ).length,
          activeUsers: users.filter((u) => accountStatus(u) === 'ACTIVE').length,
        },
        finance: canFinance
          ? {
              acquisitionCost: 0,
              extraCosts: 0,
              salesValue: 0,
              grossMargin: 0,
            }
          : null,
        charts: {
          leadsByOrigin: [{ name: 'quiz', value: leads.length }],
          funnel: LEAD_PIPELINE_STAGES.map((stage) => ({
            stage,
            count: leads.filter(
              (l) =>
                (l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO')) === stage,
            ).length,
          })),
        },
        alerts: [],
      },
      200,
      origin,
    )
  }

  if (p === '/admin/users' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'users.view', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    const teams = await store.listTeams()
    let users = (await ctx.ensureUsers()).map((u) => publicUser(u, teams))
    if (q) {
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
    }
    return json({ ok: true, ...paginate(users, page, pageSize) }, 200, origin)
  }

  if (p === '/admin/users' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'users.invite', json, origin)
    if (denied) return denied
    try {
      const body = (await req.json()) as {
        name?: string
        email?: string
        password?: string
        role?: string
        teamId?: string | null
        permissionExtras?: Permission[]
        slug?: string
      }
      const name = String(body.name || '').trim()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      const role = normalizeRole(body.role)
      const teamId = body.teamId ? String(body.teamId) : null
      const extras = normalizePermissionExtras(role, body.permissionExtras)

      if (!name || !email || password.length < 6) {
        return json(
          {
            ok: false,
            error: 'Informe nome, e-mail e senha (mín. 6 caracteres)',
          },
          400,
          origin,
        )
      }
      if (!canAssignRole(auth.role, role)) {
        return json(
          { ok: false, error: 'Você não pode criar este cargo' },
          403,
          origin,
        )
      }
      for (const perm of extras) {
        if (!hasPermission(auth.role, perm, auth.permissionExtras || [])) {
          return json(
            { ok: false, error: 'Não pode conceder permissão superior' },
            403,
            origin,
          )
        }
      }

      const users = await ctx.ensureUsers()
      if (
        users.some(
          (u) => u.email === email && accountStatus(u) !== 'ARCHIVED',
        )
      ) {
        return json({ ok: false, error: 'E-mail já cadastrado' }, 409, origin)
      }

      const teams = await store.listTeams()
      if (teamId && !teams.some((t) => (t as { id?: string }).id === teamId)) {
        return json({ ok: false, error: 'Equipe não encontrada' }, 400, origin)
      }

      const { hash, salt } = await ctx.hashPassword(password)
      const user: UserRecord = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        status: 'ACTIVE',
        active: true,
        teamId,
        managerId: null,
        permissionExtras: extras,
        password_hash: hash,
        password_salt: salt,
        created_at: new Date().toISOString(),
        invited_at: null,
        slug: uniqueCaptadorSlug(
          slugifyCaptador(String(body.slug || '')) || slugFromUserName(name),
          users,
        ),
      }
      users.push(user)
      await ctx.writeUsers(users)

      if (teamId) {
        const nextTeams = teams.map((t) => {
          const team = t as {
            id?: string
            memberIds?: string[]
          }
          if (team.id !== teamId) return t
          const memberIds = Array.isArray(team.memberIds)
            ? [...team.memberIds]
            : []
          if (!memberIds.includes(user.id)) memberIds.push(user.id)
          return { ...team, memberIds }
        })
        await store.saveTeams(nextTeams)
      }

      await audit(store, auth, 'users.create', 'user', user.id, {
        email,
        role,
        teamId,
      })

      return json(
        {
          ok: true,
          user: publicUser(user, await store.listTeams()),
        },
        201,
        origin,
      )
    } catch {
      return json({ ok: false, error: 'JSON inválido' }, 400, origin)
    }
  }

  if (p === '/admin/invites' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'users.invite', json, origin)
    if (denied) return denied
    try {
      const body = (await req.json()) as {
        name?: string
        email?: string
        role?: string
        teamId?: string
        managerId?: string
        permissionExtras?: Permission[]
      }
      const name = String(body.name || '').trim()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const role = normalizeRole(body.role)
      if (!name || !email) {
        return json({ ok: false, error: 'Informe nome e e-mail' }, 400, origin)
      }
      if (!canAssignRole(auth.role, role)) {
        return json(
          { ok: false, error: 'Você não pode convidar este cargo' },
          403,
          origin,
        )
      }
      const users = await ctx.ensureUsers()
      if (users.some((u) => u.email === email && accountStatus(u) !== 'ARCHIVED')) {
        return json({ ok: false, error: 'E-mail já cadastrado' }, 409, origin)
      }
      const settings = await store.getSettings()
      const token = newInviteToken()
      const invite = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        teamId: body.teamId || null,
        managerId: body.managerId || null,
        permissionExtras: body.permissionExtras || [],
        token_hash: await sha256Base64Url(token),
        status: 'PENDING',
        invitedBy: auth.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + (settings.inviteExpiryHours || 72) * 3600_000,
        ).toISOString(),
        accepted_at: null,
        revoked_at: null,
      }
      const invites = await store.listInvites()
      invites.unshift(invite)
      await store.saveInvites(invites)
      const placeholder: UserRecord = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        status: 'INVITED',
        active: false,
        teamId: body.teamId || null,
        managerId: body.managerId || null,
        permissionExtras: body.permissionExtras || [],
        password_hash: '',
        password_salt: '',
        created_at: new Date().toISOString(),
        invited_at: invite.created_at,
        inviteId: invite.id,
        slug: uniqueCaptadorSlug(slugFromUserName(name), users),
      }
      users.push(placeholder)
      await ctx.writeUsers(users)
      await audit(store, auth, 'users.invite', 'user', placeholder.id, {
        email,
        role,
      })
      const appUrl = env.ADMIN_APP_URL || 'https://admin.alpharecupera.com.br'
      return json(
        {
          ok: true,
          invite: {
            id: invite.id,
            email,
            name,
            role,
            status: invite.status,
            expires_at: invite.expires_at,
            created_at: invite.created_at,
          },
          inviteLink: `${appUrl}/#/aceitar-convite?token=${token}`,
          emailConfigured: false,
        },
        201,
        origin,
      )
    } catch {
      return json({ ok: false, error: 'JSON inválido' }, 400, origin)
    }
  }

  if (p === '/admin/invites' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'users.view', json, origin)
    if (denied) return denied
    const invites = (await store.listInvites()).map((i) => {
      const row = i as Record<string, unknown>
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        status: row.status,
        expires_at: row.expires_at,
        created_at: row.created_at,
        accepted_at: row.accepted_at,
        revoked_at: row.revoked_at,
      }
    })
    return json({ ok: true, invites }, 200, origin)
  }

  if (p === '/admin/invites/accept' && req.method === 'POST') {
    try {
      const body = (await req.json()) as {
        token?: string
        password?: string
        name?: string
      }
      const token = String(body.token || '')
      const password = String(body.password || '')
      if (!token || password.length < 8) {
        return json(
          {
            ok: false,
            error: 'Informe o token e uma senha com no mínimo 8 caracteres',
          },
          400,
          origin,
        )
      }
      const tokenHash = await sha256Base64Url(token)
      const invites = await store.listInvites()
      const invite = invites.find(
        (i) => (i as { token_hash?: string }).token_hash === tokenHash,
      ) as Record<string, unknown> | undefined
      if (!invite) {
        return json({ ok: false, error: 'Convite inválido' }, 404, origin)
      }
      if (invite.status === 'REVOKED') {
        return json({ ok: false, error: 'Convite revogado' }, 410, origin)
      }
      if (invite.status === 'ACCEPTED') {
        return json({ ok: false, error: 'Convite já utilizado' }, 410, origin)
      }
      if (new Date(String(invite.expires_at)).getTime() < Date.now()) {
        invite.status = 'EXPIRED'
        await store.saveInvites(invites)
        return json({ ok: false, error: 'Convite expirado' }, 410, origin)
      }
      const users = await ctx.ensureUsers()
      let user = users.find((u) => u.email === invite.email)
      const { hash, salt } = await ctx.hashPassword(password)
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          email: String(invite.email),
          name: String(invite.name),
          role: normalizeRole(String(invite.role)),
          created_at: new Date().toISOString(),
        }
        users.push(user)
      }
      user.name = String(body.name || invite.name)
      user.role = normalizeRole(String(invite.role))
      user.status = 'ACTIVE'
      user.active = true
      user.password_hash = hash
      user.password_salt = salt
      user.permissionExtras = (invite.permissionExtras as Permission[]) || []
      if (!user.slug) {
        user.slug = uniqueCaptadorSlug(slugFromUserName(user.name), users, user.id)
      }
      await ctx.writeUsers(users)
      invite.status = 'ACCEPTED'
      invite.accepted_at = new Date().toISOString()
      invite.token_hash = await sha256Base64Url(crypto.randomUUID())
      await store.saveInvites(invites)
      const now = Math.floor(Date.now() / 1000)
      const jti = crypto.randomUUID()
      const jwt = await ctx.signJwt(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: normalizeRole(user.role),
          jti,
          iat: now,
          exp: now + ctx.tokenTtl,
        },
        ctx.jwtSecret,
      )
      const sessions = await store.listSessions()
      sessions.unshift({
        id: jti,
        userId: user.id,
        created_at: new Date().toISOString(),
        expires_at: new Date((now + ctx.tokenTtl) * 1000).toISOString(),
        revoked: false,
      })
      await store.saveSessions(sessions.slice(0, 2000))
      return json(
        {
          ok: true,
          token: jwt,
          user: publicUser(user, await store.listTeams()),
        },
        200,
        origin,
      )
    } catch {
      return json({ ok: false, error: 'JSON inválido' }, 400, origin)
    }
  }

  const userMatch = p.match(/^\/admin\/users\/([^/]+)$/)
  if (userMatch && req.method === 'PATCH') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    try {
      const id = decodeURIComponent(userMatch[1])
      const body = (await req.json()) as Record<string, unknown>
      const users = await ctx.ensureUsers()
      const idx = users.findIndex((u) => u.id === id)
      if (idx < 0) {
        return json({ ok: false, error: 'Usuário não encontrado' }, 404, origin)
      }
      const target = users[idx]
      const isSelf = auth.id === id

      if (isSelf) {
        if (typeof body.name === 'string' && body.name.trim()) {
          target.name = body.name.trim()
        }
        users[idx] = target
        await ctx.writeUsers(users)
        return json(
          { ok: true, user: publicUser(target, await store.listTeams()) },
          200,
          origin,
        )
      }

      const denied = requirePerm(auth, 'users.edit', json, origin)
      if (denied) return denied

      if (
        body.status === 'SUSPENDED' ||
        body.status === 'ARCHIVED' ||
        body.active === false
      ) {
        const suspendDenied = requirePerm(auth, 'users.suspend', json, origin)
        if (suspendDenied) return suspendDenied
        const check = canSuspendOrArchiveUser(auth.role, target, auth.id, users)
        if (!check.ok) {
          return json({ ok: false, error: check.error }, 400, origin)
        }
      }

      if (body.role) {
        const roleDenied = requirePerm(auth, 'roles.assign', json, origin)
        if (roleDenied) return roleDenied
        const role = normalizeRole(String(body.role))
        if (!canAssignRole(auth.role, role)) {
          return json(
            { ok: false, error: 'Não pode atribuir este cargo' },
            403,
            origin,
          )
        }
        if (normalizeRole(target.role) === 'admin' && role !== 'admin') {
          const check = canSuspendOrArchiveUser(
            auth.role,
            target,
            auth.id,
            users,
          )
          if (!check.ok) {
            return json({ ok: false, error: check.error }, 400, origin)
          }
        }
        target.role = role
      }

      if (typeof body.name === 'string' && body.name.trim()) {
        target.name = body.name.trim()
      }
      if (body.teamId !== undefined) {
        target.teamId = body.teamId ? String(body.teamId) : null
      }
      if (body.managerId !== undefined) {
        target.managerId = body.managerId ? String(body.managerId) : null
      }
      if (Array.isArray(body.permissionExtras)) {
        const nextRole = normalizeRole(target.role)
        const extras = normalizePermissionExtras(
          nextRole,
          body.permissionExtras as Permission[],
        )
        for (const perm of extras) {
          if (!hasPermission(auth.role, perm, auth.permissionExtras || [])) {
            return json(
              { ok: false, error: 'Não pode conceder permissão superior' },
              403,
              origin,
            )
          }
        }
        target.permissionExtras = extras
      }
      if (body.status) {
        target.status = String(body.status)
        target.active = body.status === 'ACTIVE'
      } else if (typeof body.active === 'boolean') {
        target.active = body.active
        target.status = body.active ? 'ACTIVE' : 'SUSPENDED'
      }
      if (body.slug !== undefined || (typeof body.name === 'string' && body.name.trim())) {
        const desired =
          body.slug !== undefined
            ? slugifyCaptador(String(body.slug || ''))
            : target.slug || slugFromUserName(target.name)
        target.slug = uniqueCaptadorSlug(
          desired || slugFromUserName(target.name),
          users,
          target.id,
        )
      }

      users[idx] = target
      await ctx.writeUsers(users)
      await audit(store, auth, 'users.update', 'user', id, {
        status: target.status,
        role: target.role,
        extras: target.permissionExtras || [],
      })
      return json(
        { ok: true, user: publicUser(target, await store.listTeams()) },
        200,
        origin,
      )
    } catch {
      return json({ ok: false, error: 'JSON inválido' }, 400, origin)
    }
  }

  const revokeSessions = p.match(/^\/admin\/users\/([^/]+)\/sessions\/revoke$/)
  if (revokeSessions && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'users.sessions.revoke', json, origin)
    if (denied) return denied
    const id = decodeURIComponent(revokeSessions[1])
    const sessions = await store.listSessions()
    let count = 0
    for (const s of sessions as { userId?: string; revoked?: boolean; revoked_at?: string }[]) {
      if (s.userId === id && !s.revoked) {
        s.revoked = true
        s.revoked_at = new Date().toISOString()
        count++
      }
    }
    await store.saveSessions(sessions)
    await audit(store, auth, 'users.sessions.revoke', 'user', id, { count })
    return json({ ok: true, revoked: count }, 200, origin)
  }

  if (p === '/admin/teams' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'teams.view', json, origin)
    if (denied) return denied
    const users = await ctx.ensureUsers()
    const teams = (await store.listTeams()).map((t) => {
      const team = t as {
        id: string
        memberIds?: string[]
        name: string
        leaderId?: string | null
        archived?: boolean
      }
      return {
        ...team,
        memberCount: (team.memberIds || []).length,
        members: (team.memberIds || [])
          .map((id) => {
            const u = users.find((x) => x.id === id)
            return u
              ? {
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  role: normalizeRole(u.role),
                }
              : null
          })
          .filter(Boolean),
      }
    })
    return json({ ok: true, teams }, 200, origin)
  }

  if (p === '/admin/teams' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'teams.manage', json, origin)
    if (denied) return denied
    const body = (await req.json()) as { name?: string; leaderId?: string }
    const name = String(body.name || '').trim()
    if (!name) {
      return json({ ok: false, error: 'Informe o nome da equipe' }, 400, origin)
    }
    const teams = await store.listTeams()
    const team = {
      id: crypto.randomUUID(),
      key: name.toLowerCase().replace(/\s+/g, '_').slice(0, 40),
      name,
      leaderId: body.leaderId || null,
      memberIds: [] as string[],
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    teams.push(team)
    await store.saveTeams(teams)
    await audit(store, auth, 'teams.create', 'team', team.id, { name })
    return json({ ok: true, team }, 201, origin)
  }

  if (p === '/admin/leads' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.view', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let leads = await ctx.readLeads()
    if (q) {
      leads = leads.filter(
        (l) =>
          String(l.nome || '')
            .toLowerCase()
            .includes(q) ||
          String(l.modelo || '')
            .toLowerCase()
            .includes(q),
      )
    }
    const pageData = paginate(leads, page, pageSize)
    pageData.items = pageData.items.map((l) => ({
      ...l,
      telefone: maskPhone(String(l.telefone || '')),
      pipeline: l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO'),
    }))
    return json({ ok: true, ...pageData }, 200, origin)
  }

  if (p === '/admin/vehicles' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'vehicles.view', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let vehicles = (await ctx.readLeads()).map((lead) => ({
      id: `veh_${lead.id}`,
      leadId: lead.id,
      marca: lead.marca || '',
      modelo: lead.modelo || '',
      ano: lead.ano || '',
      quilometragem: lead.quilometragem || '',
      ownerName: lead.nome || '',
      pipeline: lead.pipeline || (lead.qualified ? 'QUALIFICADO' : 'NOVO'),
      created_at: lead.created_at,
      source: 'lead',
    }))
    if (q) {
      vehicles = vehicles.filter(
        (v) =>
          String(v.marca).toLowerCase().includes(q) ||
          String(v.modelo).toLowerCase().includes(q),
      )
    }
    return json({ ok: true, ...paginate(vehicles, page, pageSize) }, 200, origin)
  }

  if (p === '/admin/evaluations' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    if (
      !hasPermission(auth.role, 'vehicles.evaluate') &&
      !hasPermission(auth.role, 'vehicles.view')
    ) {
      return deny(json, origin)
    }
    const { page, pageSize } = parsePageParams(url.searchParams)
    return json(
      { ok: true, ...paginate(await store.listEvaluations(), page, pageSize) },
      200,
      origin,
    )
  }

  if (p === '/admin/acquisitions' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'acquisitions.view', json, origin)
    if (denied) return denied
    const { page, pageSize } = parsePageParams(url.searchParams)
    return json(
      { ok: true, ...paginate(await store.listAcquisitions(), page, pageSize) },
      200,
      origin,
    )
  }

  if (p === '/admin/inventory' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'inventory.view', json, origin)
    if (denied) return denied
    const { page, pageSize } = parsePageParams(url.searchParams)
    return json(
      { ok: true, ...paginate(await store.listInventory(), page, pageSize) },
      200,
      origin,
    )
  }

  if (p === '/admin/catalog' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'inventory.manage', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let items = (await store.listCatalog()) as CatalogVehicleRecord[]
    if (q) {
      items = items.filter((v) =>
        [v.marca, v.modelo, v.ano, v.cidade]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    items.sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
    )
    return json({ ok: true, ...paginate(items, page, pageSize) }, 200, origin)
  }

  if (p === '/admin/catalog' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'inventory.manage', json, origin)
    if (denied) return denied
    const body = (await req.json()) as Record<string, unknown>
    const fields = sanitizeCatalogInput(body)
    if (!fields.marca || !fields.modelo) {
      return json(
        { ok: false, error: 'Informe marca e modelo' },
        400,
        origin,
      )
    }
    const now = new Date().toISOString()
    const item: CatalogVehicleRecord = {
      id: crypto.randomUUID(),
      created_at: now,
      ...fields,
      updated_at: now,
    }
    const all = (await store.listCatalog()) as CatalogVehicleRecord[]
    all.unshift(item)
    await store.saveCatalog(all)
    await audit(store, auth, 'catalog.create', 'catalog', item.id, {
      marca: item.marca,
      modelo: item.modelo,
    })
    return json({ ok: true, vehicle: item }, 201, origin)
  }

  {
    const catMatch = p.match(/^\/admin\/catalog\/([^/]+)$/)
    if (catMatch && req.method === 'PATCH') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'inventory.manage', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(catMatch[1])
      const all = (await store.listCatalog()) as CatalogVehicleRecord[]
      const idx = all.findIndex((v) => v.id === id)
      if (idx < 0) {
        return json({ ok: false, error: 'Veículo não encontrado' }, 404, origin)
      }
      const body = (await req.json()) as Record<string, unknown>
      const next: CatalogVehicleRecord = {
        ...all[idx],
        ...sanitizeCatalogInput(body, all[idx]),
        id: all[idx].id,
        created_at: all[idx].created_at,
      }
      all[idx] = next
      await store.saveCatalog(all)
      await audit(store, auth, 'catalog.update', 'catalog', id, {
        published: next.published,
      })
      return json({ ok: true, vehicle: next }, 200, origin)
    }
    if (catMatch && req.method === 'DELETE') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'inventory.manage', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(catMatch[1])
      const all = (await store.listCatalog()) as CatalogVehicleRecord[]
      const next = all.filter((v) => v.id !== id)
      if (next.length === all.length) {
        return json({ ok: false, error: 'Veículo não encontrado' }, 404, origin)
      }
      await store.saveCatalog(next)
      await audit(store, auth, 'catalog.delete', 'catalog', id, {})
      return json({ ok: true }, 200, origin)
    }
  }

  if (p === '/admin/sales' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'sales.view', json, origin)
    if (denied) return denied
    const { page, pageSize } = parsePageParams(url.searchParams)
    return json(
      { ok: true, ...paginate(await store.listSales(), page, pageSize) },
      200,
      origin,
    )
  }

  if (p === '/admin/finance/summary' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'finance.view_summary', json, origin)
    if (denied) return denied
    return json(
      {
        ok: true,
        summary: {
          purchaseTotal: null,
          extraCosts: null,
          salesTotal: null,
          grossMargin: null,
          boughtCount: (await store.listAcquisitions()).length,
          soldCount: (await store.listSales()).length,
        },
        moduleNote:
          'Visão gerencial integrada — não é contabilidade completa.',
      },
      200,
      origin,
    )
  }

  if (p === '/admin/marketing/summary' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'marketing.view', json, origin)
    if (denied) return denied
    return json(
      {
        ok: true,
        summary: {
          note: 'Use o Painel de Marketing completo.',
          deepLinkSection: 'marketing',
        },
      },
      200,
      origin,
    )
  }

  if (p === '/admin/reports/overview' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'reports.view', json, origin)
    if (denied) return denied
    const leads = await ctx.readLeads()
    return json(
      {
        ok: true,
        report: {
          totalLeads: leads.length,
          qualified: leads.filter((l) => l.qualified).length,
          evaluations: (await store.listEvaluations()).length,
          acquisitions: (await store.listAcquisitions()).length,
          inventory: (await store.listInventory()).length,
          sales: (await store.listSales()).length,
        },
      },
      200,
      origin,
    )
  }

  if (p === '/admin/audit' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'audit.view', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let items = await store.listAudit()
    if (q) {
      items = items.filter((a) =>
        JSON.stringify(a).toLowerCase().includes(q),
      )
    }
    return json({ ok: true, ...paginate(items, page, pageSize) }, 200, origin)
  }

  if (p === '/admin/settings' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'settings.view', json, origin)
    if (denied) return denied
    return json({ ok: true, settings: await store.getSettings() }, 200, origin)
  }

  if (p === '/admin/settings' && req.method === 'PATCH') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'settings.manage', json, origin)
    if (denied) return denied
    const body = (await req.json()) as Record<string, unknown>
    const prev = await store.getSettings()
    const next = {
      ...prev,
      ...body,
      version: Number(prev.version || 1) + 1,
      updated_at: new Date().toISOString(),
      updatedBy: auth.id,
    }
    await store.saveSettings(next)
    await audit(store, auth, 'settings.update', 'settings', 'org', {
      version: next.version,
    })
    return json({ ok: true, settings: next }, 200, origin)
  }

  if (p === '/admin/notifications' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const items = (await store.listNotifications())
      .filter(
        (n) =>
          (n as { userId?: string }).userId === auth.id ||
          !(n as { userId?: string }).userId,
      )
      .slice(0, 50)
    return json({ ok: true, notifications: items }, 200, origin)
  }

  if (p === '/admin/search' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const q = String(url.searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    if (q.length < 2) return json({ ok: true, results: [] }, 200, origin)
    const results: { type: string; id: string; title: string; subtitle: string }[] =
      []
    if (hasPermission(auth.role, 'users.view')) {
      for (const u of await ctx.ensureUsers()) {
        if (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
          results.push({
            type: 'user',
            id: u.id,
            title: u.name,
            subtitle: u.email,
          })
        }
      }
    }
    if (hasPermission(auth.role, 'leads.view')) {
      for (const l of await ctx.readLeads()) {
        if (String(l.nome || '').toLowerCase().includes(q)) {
          results.push({
            type: 'lead',
            id: String(l.id),
            title: String(l.nome),
            subtitle: `${l.marca || ''} ${l.modelo || ''}`.trim(),
          })
        }
      }
    }
    return json({ ok: true, results: results.slice(0, 30) }, 200, origin)
  }

  if (p === '/admin/health' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'system.health.view', json, origin)
    if (denied) return denied
    return json(
      {
        ok: true,
        health: {
          api: 'ok',
          storage: 'ok',
          version: env.APP_VERSION || 'worker',
          timezone: (await store.getSettings()).timezone,
          checkedAt: new Date().toISOString(),
        },
      },
      200,
      origin,
    )
  }

  if (p === '/admin/actions' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'admin.dashboard.view', json, origin)
    if (denied) return denied
    const leads = await ctx.readLeads()
    const actions = leads
      .filter((l) => !l.assigneeId && l.status !== 'finalizado')
      .slice(0, 20)
      .map((l) => ({
        type: 'lead_unassigned',
        id: l.id,
        title: `Lead sem responsável: ${l.nome}`,
        href: 'leads',
      }))
    return json({ ok: true, actions }, 200, origin)
  }

  // ---- Compra / Venda (C/V) ----
  if (p === '/admin/cv' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.view', json, origin)
    if (denied) return denied
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    const statusFilter = url.searchParams.get('status') || ''
    let items = ((await store.listCv()) as CvDeal[]).map((d) => ({
      ...d,
      status: normalizeCvStatus(d.status),
    }))
    if (statusFilter === 'compra' || statusFilter === 'venda' || statusFilter === 'fechado') {
      items = items.filter((d) => d.status === statusFilter)
    }
    if (q) {
      items = items.filter((d) =>
        [
          d.cliente_nome,
          d.marca,
          d.modelo,
          d.ano,
          d.placa,
          d.cliente_telefone,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    }
    items.sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
    )
    return json({ ok: true, ...paginate(items, page, pageSize) }, 200, origin)
  }

  if (p === '/admin/cv/from-lead' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    const body = (await req.json()) as { leadId?: string }
    const leadId = String(body.leadId || '').trim()
    if (!leadId) {
      return json({ ok: false, error: 'leadId obrigatório' }, 400, origin)
    }
    const leads = await ctx.readLeads()
    const lead = leads.find((l) => String(l.id) === leadId)
    if (!lead) {
      return json({ ok: false, error: 'Lead não encontrado' }, 404, origin)
    }
    const all = (await store.listCv()) as CvDeal[]
    const existing = all.find((d) => d.leadId === leadId)
    if (existing) {
      return json(
        {
          ok: true,
          deal: { ...existing, status: normalizeCvStatus(existing.status) },
          existing: true,
        },
        200,
        origin,
      )
    }
    const now = new Date().toISOString()
    const item: CvDeal = {
      id: makeCvId(),
      created_at: now,
      updated_at: now,
      status: 'compra',
      leadId,
      cliente_nome: String(lead.nome || ''),
      cliente_telefone: String(lead.telefone || ''),
      marca: String(lead.marca || ''),
      modelo: String(lead.modelo || ''),
      ano: String(lead.ano || ''),
      km: String(lead.quilometragem || ''),
      banco: String(lead.banco || ''),
      compra_valor: '',
      compra_data: now.slice(0, 10),
      compra_obs: '',
      venda_valor: '',
      venda_data: '',
      venda_comprador: '',
      venda_obs: '',
      docs: [],
      created_by: auth.id,
      created_by_name: auth.name,
    }
    all.unshift(item)
    await store.saveCv(all)
    // marca lead como finalizado (atendido / comprado)
    const idx = leads.findIndex((l) => String(l.id) === leadId)
    if (idx >= 0) {
      leads[idx] = {
        ...leads[idx],
        status: 'finalizado',
        finalized_at: now,
        contacted_at: leads[idx].contacted_at || now,
      }
      await ctx.writeLeads(leads)
    }
    await audit(store, auth, 'cv.from_lead', 'cv', item.id, { leadId })
    return json({ ok: true, deal: item, existing: false }, 201, origin)
  }

  if (p === '/admin/cv' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    const body = (await req.json()) as Record<string, unknown>
    if (!body.status) body.status = 'compra'
    const fields = sanitizeCvInput(body)
    if (!fields.marca && !fields.modelo && !fields.cliente_nome) {
      return json(
        { ok: false, error: 'Informe ao menos cliente ou veículo' },
        400,
        origin,
      )
    }
    const now = new Date().toISOString()
    const item: CvDeal = {
      id: makeCvId(),
      created_at: now,
      docs: [],
      created_by: auth.id,
      created_by_name: auth.name,
      ...fields,
      updated_at: now,
    }
    const all = (await store.listCv()) as CvDeal[]
    all.unshift(item)
    await store.saveCv(all)
    await audit(store, auth, 'cv.create', 'cv', item.id, {
      marca: item.marca,
      modelo: item.modelo,
    })
    return json({ ok: true, deal: item }, 201, origin)
  }

  {
    const cvMatch = p.match(/^\/admin\/cv\/([^/]+)$/)
    if (cvMatch && req.method === 'GET') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.view', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(cvMatch[1])
      const all = (await store.listCv()) as CvDeal[]
      const item = all.find((d) => d.id === id)
      if (!item) {
        return json({ ok: false, error: 'Caso não encontrado' }, 404, origin)
      }
      return json({ ok: true, deal: item }, 200, origin)
    }
    if (cvMatch && req.method === 'PATCH') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(cvMatch[1])
      const all = (await store.listCv()) as CvDeal[]
      const idx = all.findIndex((d) => d.id === id)
      if (idx < 0) {
        return json({ ok: false, error: 'Caso não encontrado' }, 404, origin)
      }
      const body = (await req.json()) as Record<string, unknown>
      const prev = all[idx]
      const next: CvDeal = {
        ...prev,
        ...sanitizeCvInput(body, prev),
        id: prev.id,
        created_at: prev.created_at,
        docs: prev.docs || [],
        created_by: prev.created_by,
        created_by_name: prev.created_by_name,
      }
      all[idx] = next
      await store.saveCv(all)
      await audit(store, auth, 'cv.update', 'cv', id, {})
      return json({ ok: true, deal: next }, 200, origin)
    }
    if (cvMatch && req.method === 'DELETE') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(cvMatch[1])
      const all = (await store.listCv()) as CvDeal[]
      const next = all.filter((d) => d.id !== id)
      if (next.length === all.length) {
        return json({ ok: false, error: 'Caso não encontrado' }, 404, origin)
      }
      await store.saveCv(next)
      await audit(store, auth, 'cv.delete', 'cv', id, {})
      return json({ ok: true }, 200, origin)
    }
  }

  {
    const cvDocUp = p.match(/^\/admin\/cv\/([^/]+)\/documents$/)
    if (cvDocUp && req.method === 'POST') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const dealId = decodeURIComponent(cvDocUp[1])
      const all = (await store.listCv()) as CvDeal[]
      const idx = all.findIndex((d) => d.id === dealId)
      if (idx < 0) {
        return json({ ok: false, error: 'Caso não encontrado' }, 404, origin)
      }
      try {
        const form = await req.formData()
        const file = form.get('file')
        const kindRaw = String(form.get('kind') || 'outro')
        const kind: CvDocumentKind =
          kindRaw === 'compra' || kindRaw === 'venda' ? kindRaw : 'outro'
        const blob =
          typeof file === 'object' &&
          file !== null &&
          typeof (file as Blob).arrayBuffer === 'function'
            ? (file as Blob)
            : null
        if (!blob || !blob.size) {
          return json({ ok: false, error: 'Arquivo obrigatório' }, 400, origin)
        }
        if (blob.size > 8 * 1024 * 1024) {
          return json(
            { ok: false, error: 'Arquivo muito grande (máx. 8MB)' },
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
        const isPdf =
          buf[0] === 0x25 &&
          buf[1] === 0x50 &&
          buf[2] === 0x44 &&
          buf[3] === 0x46
        if (!isJpeg && !isPng && !isPdf) {
          return json(
            { ok: false, error: 'Use JPG, PNG ou PDF' },
            400,
            origin,
          )
        }
        const mime = isPdf
          ? 'application/pdf'
          : isPng
            ? 'image/png'
            : 'image/jpeg'
        const docId = crypto.randomUUID()
        const storageKey = `kv:cv:doc:${docId}`
        await env.LEADS_KV.put(storageKey, buf, {
          metadata: { mime },
        })
        const apiBase = (env.PUBLIC_API_URL || url.origin).replace(/\/$/, '')
        const fileName =
          typeof file === 'object' &&
          file !== null &&
          'name' in file &&
          typeof (file as File).name === 'string'
            ? (file as File).name
            : `documento.${isPdf ? 'pdf' : isPng ? 'png' : 'jpg'}`
        const doc: CvDocument = {
          id: docId,
          kind,
          name: fileName,
          mime,
          url: `${apiBase}/admin/cv/documents/file/${docId}`,
          size: buf.length,
          uploaded_at: new Date().toISOString(),
          uploaded_by: auth.name,
        }
        const deal = all[idx]
        const docs = [...(deal.docs || []), doc]
        const next: CvDeal = {
          ...deal,
          docs,
          updated_at: new Date().toISOString(),
        }
        all[idx] = next
        await store.saveCv(all)
        await audit(store, auth, 'cv.doc.upload', 'cv', dealId, {
          docId,
          kind,
        })
        return json({ ok: true, deal: next, document: doc }, 201, origin)
      } catch (e) {
        return json(
          {
            ok: false,
            error: e instanceof Error ? e.message : 'Falha no upload',
          },
          400,
          origin,
        )
      }
    }
  }

  {
    const cvDocDel = p.match(/^\/admin\/cv\/([^/]+)\/documents\/([^/]+)$/)
    if (cvDocDel && req.method === 'DELETE') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const dealId = decodeURIComponent(cvDocDel[1])
      const docId = decodeURIComponent(cvDocDel[2])
      const all = (await store.listCv()) as CvDeal[]
      const idx = all.findIndex((d) => d.id === dealId)
      if (idx < 0) {
        return json({ ok: false, error: 'Caso não encontrado' }, 404, origin)
      }
      const deal = all[idx]
      const docs = (deal.docs || []).filter((d) => d.id !== docId)
      if (docs.length === (deal.docs || []).length) {
        return json({ ok: false, error: 'Documento não encontrado' }, 404, origin)
      }
      await env.LEADS_KV.delete(`kv:cv:doc:${docId}`)
      const next: CvDeal = {
        ...deal,
        docs,
        updated_at: new Date().toISOString(),
      }
      all[idx] = next
      await store.saveCv(all)
      await audit(store, auth, 'cv.doc.delete', 'cv', dealId, { docId })
      return json({ ok: true, deal: next }, 200, origin)
    }
  }

  {
    const cvFile = p.match(/^\/admin\/cv\/documents\/file\/([^/]+)$/)
    if (cvFile && req.method === 'GET') {
      const id = decodeURIComponent(cvFile[1])
      const obj = await env.LEADS_KV.getWithMetadata<{ mime?: string }>(
        `kv:cv:doc:${id}`,
        'arrayBuffer',
      )
      if (!obj.value) {
        return json({ ok: false, error: 'Arquivo não encontrado' }, 404, origin)
      }
      return new Response(obj.value, {
        status: 200,
        headers: {
          'Content-Type': obj.metadata?.mime || 'application/octet-stream',
          'Cache-Control': 'private, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }

  // ---- Agenda + Avisos (D1) ----
  const failAgenda = (e: unknown) =>
    json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : 'Falha ao acessar a agenda',
      },
      500,
      origin,
    )

  if (p === '/admin/agenda' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.view', json, origin)
    if (denied) return denied
    try {
      const from = url.searchParams.get('from') || ''
      const to = url.searchParams.get('to') || ''
      const items = agenda
        ? await agenda.listEvents(from || undefined, to || undefined)
        : ((await store.listAgenda()) as AgendaEvent[])
            .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
            .sort((a, b) => {
              const d = String(a.date).localeCompare(String(b.date))
              if (d !== 0) return d
              return String(a.start_time || '').localeCompare(
                String(b.start_time || ''),
              )
            })
      return json({ ok: true, items }, 200, origin)
    } catch (e) {
      return failAgenda(e)
    }
  }

  if (p === '/admin/agenda' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    try {
      const body = (await req.json()) as Record<string, unknown>
      const fields = sanitizeAgendaEvent(body)
      if (!fields.title.trim() || fields.title === 'Sem título') {
        return json({ ok: false, error: 'Título obrigatório' }, 400, origin)
      }
      const now = new Date().toISOString()
      const item: AgendaEvent = {
        id: makeAgendaId('ev'),
        created_at: now,
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        updated_at: now,
      }
      if (agenda) {
        await agenda.insertEvent(item)
      } else {
        const all = (await store.listAgenda()) as AgendaEvent[]
        all.unshift(item)
        await store.saveAgenda(all)
      }
      await audit(store, auth, 'agenda.create', 'agenda', item.id, {
        title: item.title,
      })
      return json({ ok: true, event: item }, 201, origin)
    } catch (e) {
      return failAgenda(e)
    }
  }

  {
    const agMatch = p.match(/^\/admin\/agenda\/([^/]+)$/)
    if (agMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(agMatch[1])
      try {
        if (req.method === 'DELETE') {
          if (agenda) {
            const ok = await agenda.deleteEvent(id)
            if (!ok) {
              return json(
                { ok: false, error: 'Evento não encontrado' },
                404,
                origin,
              )
            }
          } else {
            const all = (await store.listAgenda()) as AgendaEvent[]
            const next = all.filter((e) => e.id !== id)
            if (next.length === all.length) {
              return json(
                { ok: false, error: 'Evento não encontrado' },
                404,
                origin,
              )
            }
            await store.saveAgenda(next)
          }
          await audit(store, auth, 'agenda.delete', 'agenda', id, {})
          return json({ ok: true }, 200, origin)
        }

        const prev = agenda
          ? await agenda.getEvent(id)
          : ((await store.listAgenda()) as AgendaEvent[]).find((e) => e.id === id)
        if (!prev) {
          return json({ ok: false, error: 'Evento não encontrado' }, 404, origin)
        }
        const body = (await req.json()) as Record<string, unknown>
        const next: AgendaEvent = {
          ...prev,
          ...sanitizeAgendaEvent(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
        }
        if (agenda) {
          await agenda.updateEvent(id, next)
        } else {
          const all = (await store.listAgenda()) as AgendaEvent[]
          const idx = all.findIndex((e) => e.id === id)
          all[idx] = next
          await store.saveAgenda(all)
        }
        await audit(store, auth, 'agenda.update', 'agenda', id, {})
        return json({ ok: true, event: next }, 200, origin)
      } catch (e) {
        return failAgenda(e)
      }
    }
  }

  if (p === '/admin/notices' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.view', json, origin)
    if (denied) return denied
    try {
      const activeOnly = url.searchParams.get('active') === '1'
      let items = agenda
        ? await agenda.listNotices()
        : ((await store.listNotices()) as PanelNotice[])
      if (activeOnly) items = items.filter((n) => isNoticeVisible(n))
      items.sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
      })
      return json({ ok: true, items }, 200, origin)
    } catch (e) {
      return failAgenda(e)
    }
  }

  if (p === '/admin/notices' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    try {
      const body = (await req.json()) as Record<string, unknown>
      const fields = sanitizeNotice(body)
      if (!fields.title.trim()) {
        return json({ ok: false, error: 'Título obrigatório' }, 400, origin)
      }
      const now = new Date().toISOString()
      const item: PanelNotice = {
        id: makeAgendaId('nt'),
        created_at: now,
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        updated_at: now,
      }
      if (agenda) await agenda.insertNotice(item)
      else {
        const all = (await store.listNotices()) as PanelNotice[]
        all.unshift(item)
        await store.saveNotices(all)
      }
      await audit(store, auth, 'notice.create', 'notice', item.id, {
        title: item.title,
      })
      return json({ ok: true, notice: item }, 201, origin)
    } catch (e) {
      return failAgenda(e)
    }
  }

  {
    const ntMatch = p.match(/^\/admin\/notices\/([^/]+)$/)
    if (ntMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(ntMatch[1])
      try {
        if (req.method === 'DELETE') {
          if (agenda) {
            const ok = await agenda.deleteNotice(id)
            if (!ok) {
              return json(
                { ok: false, error: 'Aviso não encontrado' },
                404,
                origin,
              )
            }
          } else {
            const all = (await store.listNotices()) as PanelNotice[]
            const next = all.filter((n) => n.id !== id)
            if (next.length === all.length) {
              return json(
                { ok: false, error: 'Aviso não encontrado' },
                404,
                origin,
              )
            }
            await store.saveNotices(next)
          }
          await audit(store, auth, 'notice.delete', 'notice', id, {})
          return json({ ok: true }, 200, origin)
        }

        const prev = agenda
          ? await agenda.getNotice(id)
          : ((await store.listNotices()) as PanelNotice[]).find((n) => n.id === id)
        if (!prev) {
          return json({ ok: false, error: 'Aviso não encontrado' }, 404, origin)
        }
        const body = (await req.json()) as Record<string, unknown>
        const next: PanelNotice = {
          ...prev,
          ...sanitizeNotice(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
        }
        if (agenda) await agenda.updateNotice(id, next)
        else {
          const all = (await store.listNotices()) as PanelNotice[]
          const idx = all.findIndex((n) => n.id === id)
          all[idx] = next
          await store.saveNotices(all)
        }
        await audit(store, auth, 'notice.update', 'notice', id, {})
        return json({ ok: true, notice: next }, 200, origin)
      } catch (e) {
        return failAgenda(e)
      }
    }
  }

  // ---- Pagamentos ----
  if (p === '/admin/payments' && req.method === 'GET') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.view', json, origin)
    if (denied) return denied
    const doSync = url.searchParams.get('sync') !== '0'
    let items = (await store.listPayments()) as PaymentRecord[]
    if (doSync) {
      const deals = (await store.listCv()) as CvDeal[]
      items = syncPaymentsFromDeals(deals, items)
      await store.savePayments(items)
    }
    items.sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')),
    )
    return json(
      { ok: true, items, totals: sumPayments(items) },
      200,
      origin,
    )
  }

  if (p === '/admin/payments/sync' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    const deals = (await store.listCv()) as CvDeal[]
    const existing = (await store.listPayments()) as PaymentRecord[]
    const items = syncPaymentsFromDeals(deals, existing)
    await store.savePayments(items)
    await audit(store, auth, 'payments.sync', 'payment', null, {
      count: items.length,
    })
    return json(
      { ok: true, items, totals: sumPayments(items) },
      200,
      origin,
    )
  }

  if (p === '/admin/payments' && req.method === 'POST') {
    if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
    const denied = requirePerm(auth, 'leads.edit', json, origin)
    if (denied) return denied
    const body = (await req.json()) as Record<string, unknown>
    body.source = body.source || 'manual'
    const fields = sanitizePaymentInput(body)
    if (!fields.amount || fields.amount <= 0) {
      return json({ ok: false, error: 'Informe um valor válido' }, 400, origin)
    }
    const now = new Date().toISOString()
    const item: PaymentRecord = {
      id: makePaymentId(),
      created_at: now,
      created_by: auth.id,
      created_by_name: auth.name,
      ...fields,
      source: 'manual',
      updated_at: now,
    }
    const all = (await store.listPayments()) as PaymentRecord[]
    all.unshift(item)
    await store.savePayments(all)
    await audit(store, auth, 'payments.create', 'payment', item.id, {
      amount: item.amount,
      direction: item.direction,
    })
    return json({ ok: true, payment: item }, 201, origin)
  }

  {
    const payMatch = p.match(/^\/admin\/payments\/([^/]+)$/)
    if (payMatch && req.method === 'PATCH') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(payMatch[1])
      const all = (await store.listPayments()) as PaymentRecord[]
      const idx = all.findIndex((x) => x.id === id)
      if (idx < 0) {
        return json({ ok: false, error: 'Pagamento não encontrado' }, 404, origin)
      }
      const body = (await req.json()) as Record<string, unknown>
      const prev = all[idx]
      const next: PaymentRecord = {
        ...prev,
        ...sanitizePaymentInput(body, prev),
        id: prev.id,
        created_at: prev.created_at,
        created_by: prev.created_by,
        created_by_name: prev.created_by_name,
        source: prev.source,
        dealId: prev.dealId,
      }
      // auto: só permite mudar status/descrição
      if (prev.source !== 'manual') {
        next.amount = prev.amount
        next.amount_label = prev.amount_label
        next.direction = prev.direction
        next.date = typeof body.date === 'string' ? body.date.trim() || prev.date : prev.date
        next.description =
          typeof body.description === 'string'
            ? body.description.trim() || prev.description
            : prev.description
        next.status =
          body.status === 'pendente' || body.status === 'pago'
            ? body.status
            : prev.status
      }
      all[idx] = next
      await store.savePayments(all)
      await audit(store, auth, 'payments.update', 'payment', id, {})
      return json({ ok: true, payment: next }, 200, origin)
    }
    if (payMatch && req.method === 'DELETE') {
      if (!auth) return json({ ok: false, error: 'Não autenticado' }, 401, origin)
      const denied = requirePerm(auth, 'leads.edit', json, origin)
      if (denied) return denied
      const id = decodeURIComponent(payMatch[1])
      const all = (await store.listPayments()) as PaymentRecord[]
      const target = all.find((x) => x.id === id)
      if (!target) {
        return json({ ok: false, error: 'Pagamento não encontrado' }, 404, origin)
      }
      if (target.source !== 'manual') {
        return json(
          {
            ok: false,
            error: 'Pagamentos de compra/venda só mudam pelo caso C/V',
          },
          400,
          origin,
        )
      }
      await store.savePayments(all.filter((x) => x.id !== id))
      await audit(store, auth, 'payments.delete', 'payment', id, {})
      return json({ ok: true }, 200, origin)
    }
  }

  return json({ ok: false, error: 'Rota admin não encontrada' }, 404, origin)
}

export { createAdminKvStore, publicUser, accountStatus }
