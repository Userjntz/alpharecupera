/**
 * Rotas do Painel Administrativo da empresa.
 */
import crypto from 'node:crypto'
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
} from '../shared/admin.ts'
import { sanitizeCatalogInput } from '../shared/catalog.ts'
import { makeCvId, normalizeCvStatus, sanitizeCvInput } from '../shared/cv.ts'
import {
  isNoticeVisible,
  makeAgendaId,
  sanitizeAgendaEvent,
  sanitizeNotice,
} from '../shared/agenda.ts'
import {
  makePaymentId,
  sanitizePaymentInput,
  sumPayments,
  syncPaymentsFromDeals,
} from '../shared/payments.ts'
import { hashToken, newInviteToken } from './admin-store.mjs'
import fs from 'node:fs'
import path from 'node:path'

function readBody(req) {
  return new Promise(async (resolve, reject) => {
    try {
      let raw = ''
      for await (const chunk of req) raw += chunk
      resolve(JSON.parse(raw || '{}'))
    } catch (e) {
      reject(e)
    }
  })
}

function accountStatus(user) {
  if (user.status) return user.status
  if (user.active === false) return 'SUSPENDED'
  return 'ACTIVE'
}

function publicUser(u, teams = []) {
  const team = teams.find((t) => (t.memberIds || []).includes(u.id))
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
    mfa_enabled: Boolean(u.mfa_enabled),
  }
}

function effectivePermissions(user) {
  const role = normalizeRole(user.role)
  const extras = Array.isArray(user.permissionExtras)
    ? user.permissionExtras
    : []
  const set = new Set([...permissionsForRole(role), ...extras])
  return [...set]
}

function requirePerm(auth, permission, send, origin) {
  if (!hasPermission(auth.role, permission, auth.permissionExtras || [])) {
    send(403, { ok: false, error: 'Sem permissão' }, origin)
    return false
  }
  return true
}

function audit(store, auth, action, resource, resourceId, meta) {
  store.appendAudit({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actorId: auth?.id || null,
    actorEmail: auth?.email || null,
    actorName: auth?.name || null,
    action,
    resource,
    resourceId: resourceId || null,
    correlationId: crypto.randomUUID(),
    meta: sanitizeAuditMeta(meta) || {},
  })
}

function periodRange(period) {
  const now = new Date()
  const startOfDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const endOfDay = (d) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }
  const today = startOfDay(now)
  if (period === 'hoje') return { from: today, to: endOfDay(now) }
  if (period === 'ontem') {
    const y = new Date(today)
    y.setDate(y.getDate() - 1)
    return { from: y, to: endOfDay(y) }
  }
  if (period === '7d') {
    const f = new Date(today)
    f.setDate(f.getDate() - 6)
    return { from: f, to: endOfDay(now) }
  }
  if (period === '30d') {
    const f = new Date(today)
    f.setDate(f.getDate() - 29)
    return { from: f, to: endOfDay(now) }
  }
  if (period === 'mes') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: endOfDay(now),
    }
  }
  return { from: null, to: null }
}

function inPeriod(iso, from, to) {
  if (!from) return true
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

function vehicleFromLead(lead) {
  return {
    id: `veh_${lead.id}`,
    leadId: lead.id,
    marca: lead.marca || '',
    modelo: lead.modelo || '',
    ano: lead.ano || '',
    quilometragem: lead.quilometragem || '',
    placa: lead.placa || '',
    cor: lead.cor || '',
    ownerName: lead.nome || '',
    pipeline: lead.pipeline || (lead.qualified ? 'QUALIFICADO' : 'NOVO'),
    assigneeId: lead.assigneeId || null,
    created_at: lead.created_at,
    source: 'lead',
  }
}

/**
 * @returns {Promise<boolean>} true se a rota foi tratada
 */
export async function handleAdminRoutes(ctx) {
  const reply = (status, body) => {
    ctx.send(status, body, ctx.origin);
    return true;
  };
  // alias local send to reply for early returns
  const send = reply;
  const {
    req,
    res,
    url,
    origin,
    send: _sendIgnored,
    auth,
    ensureUsers,
    writeUsers,
    readLeads,
    writeLeads,
    store,
    hashPassword,
    signJwt,
    TOKEN_TTL_SEC,
  } = ctx

  const p = url.pathname

  // ---- Meta / matriz ----
  if (p === '/admin/meta' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    return send(
      200,
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
          ...publicUser(auth, store.listTeams()),
          permissions: effectivePermissions(auth),
        },
      },
      origin,
    )
  }

  // ---- Dashboard ----
  if (p === '/admin/dashboard' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'admin.dashboard.view', send, origin)) return true
    const period = url.searchParams.get('period') || '30d'
    const { from, to } = periodRange(period)
    const leads = readLeads()
    const periodLeads = leads.filter((l) => inPeriod(l.created_at, from, to))
    const users = ensureUsers()
    const vehicles = store.listVehicles()
    const evaluations = store.listEvaluations()
    const acquisitions = store.listAcquisitions()
    const inventory = store.listInventory()
    const sales = store.listSales()
    const canFinance = hasPermission(auth.role, 'finance.view_summary')

    const open = periodLeads.filter((l) => l.status !== 'finalizado')
    const waiting = open.filter((l) => !l.contacted_at)
    const unassigned = open.filter((l) => !l.assigneeId)
    const qualified = periodLeads.filter((l) => l.qualified)

    let firstTouchSum = 0
    let firstTouchCount = 0
    for (const l of periodLeads) {
      if (l.contacted_at && l.created_at) {
        const ms =
          new Date(l.contacted_at).getTime() - new Date(l.created_at).getTime()
        if (ms >= 0) {
          firstTouchSum += ms
          firstTouchCount++
        }
      }
    }

    const evalPending = evaluations.filter(
      (e) => e.status === 'PENDENTE' || e.status === 'EM_REVISAO',
    )
    const proposals = acquisitions.filter((a) =>
      ['PROPOSTA_ENVIADA', 'NEGOCIACAO', 'APROVADO', 'RECUSADO'].includes(
        a.stage,
      ),
    )

    const finance = canFinance
      ? {
          acquisitionCost: acquisitions
            .filter((a) => a.stage === 'COMPRADO')
            .reduce((s, a) => s + Number(a.purchaseValue || 0), 0),
          extraCosts: acquisitions
            .filter((a) => a.stage === 'COMPRADO')
            .reduce((s, a) => s + Number(a.extraCosts || 0), 0),
          salesValue: sales
            .filter((s) => s.status === 'COMPLETED')
            .reduce((s, x) => s + Number(x.saleValue || 0), 0),
          grossMargin: 0,
        }
      : null
    if (finance) {
      finance.grossMargin =
        finance.salesValue - finance.acquisitionCost - finance.extraCosts
    }

    const byOrigin = {}
    for (const l of periodLeads) {
      const originKey = l.origem || l.source || 'quiz'
      byOrigin[originKey] = (byOrigin[originKey] || 0) + 1
    }

    return send(
      200,
      {
        ok: true,
        period,
        updatedAt: new Date().toISOString(),
        kpis: {
          newLeads: periodLeads.length,
          waitingService: waiting.length,
          unassigned: unassigned.length,
          avgFirstTouchMinutes:
            firstTouchCount > 0
              ? Math.round(firstTouchSum / firstTouchCount / 60000)
              : null,
          qualified: qualified.length,
          vehiclesAwaitingEval: vehicles.filter(
            (v) => v.pipeline === 'AVALIACAO' || v.pipeline === 'AGUARDANDO_DADOS',
          ).length,
          evaluationsPending: evalPending.length,
          proposalsSent: proposals.filter((a) => a.stage === 'PROPOSTA_ENVIADA')
            .length,
          proposalsAccepted: proposals.filter((a) => a.stage === 'APROVADO')
            .length,
          proposalsRejected: proposals.filter((a) => a.stage === 'RECUSADO')
            .length,
          vehiclesBought: acquisitions.filter(
            (a) =>
              a.stage === 'COMPRADO' && inPeriod(a.updated_at || a.created_at, from, to),
          ).length,
          inStock: inventory.filter((i) =>
            ['DISPONIVEL', 'EM_PREPARACAO', 'RESERVADO', 'EM_NEGOCIACAO'].includes(
              i.status,
            ),
          ).length,
          reserved: inventory.filter((i) => i.status === 'RESERVADO').length,
          sold: sales.filter(
            (s) =>
              s.status === 'COMPLETED' &&
              inPeriod(s.completed_at || s.created_at, from, to),
          ).length,
          activeUsers: users.filter((u) => accountStatus(u) === 'ACTIVE').length,
        },
        finance,
        charts: {
          leadsByOrigin: Object.entries(byOrigin).map(([name, value]) => ({
            name,
            value,
          })),
          funnel: LEAD_PIPELINE_STAGES.map((stage) => ({
            stage,
            count: leads.filter(
              (l) =>
                (l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO')) === stage,
            ).length,
          })),
        },
        alerts: buildAlerts(store, users, leads),
      },
      origin,
    )
  }

  // ---- Users list ----
  if (p === '/admin/users' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.view', send, origin)) return true
    const { page, pageSize, q, sort, order } = parsePageParams(url.searchParams)
    const status = url.searchParams.get('status') || ''
    const role = url.searchParams.get('role') || ''
    const teams = store.listTeams()
    let users = ensureUsers().map((u) => publicUser(u, teams))
    if (q) {
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    }
    if (status) users = users.filter((u) => u.status === status)
    if (role) users = users.filter((u) => u.role === normalizeRole(role))
    users.sort((a, b) => {
      const av = a[sort] || a.created_at || ''
      const bv = b[sort] || b.created_at || ''
      const cmp = String(av).localeCompare(String(bv))
      return order === 'asc' ? cmp : -cmp
    })
    const pageData = paginate(users, page, pageSize)
    return send(200, { ok: true, ...pageData }, origin)
  }

  // ---- Create user (nome, email, senha, cargo, equipe) ----
  if (p === '/admin/users' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.invite', send, origin)) return true
    try {
      const body = await readBody(req)
      const name = String(body.name || '').trim()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const password = String(body.password || '')
      const role = normalizeRole(body.role)
      const teamId = body.teamId || null

      if (!name || !email || password.length < 6) {
        return send(
          400,
          {
            ok: false,
            error: 'Informe nome, e-mail e senha (mín. 6 caracteres)',
          },
          origin,
        )
      }
      if (!canAssignRole(auth.role, role)) {
        return send(
          403,
          { ok: false, error: 'Você não pode criar este cargo' },
          origin,
        )
      }

      const users = ensureUsers()
      if (
        users.some(
          (u) => u.email === email && accountStatus(u) !== 'ARCHIVED',
        )
      ) {
        return send(409, { ok: false, error: 'E-mail já cadastrado' }, origin)
      }

      const teams = store.listTeams()
      if (teamId && !teams.some((t) => t.id === teamId)) {
        return send(400, { ok: false, error: 'Equipe não encontrada' }, origin)
      }

      const extras = normalizePermissionExtras(role, body.permissionExtras)
      for (const perm of extras) {
        if (!hasPermission(auth.role, perm, auth.permissionExtras || [])) {
          return send(
            403,
            { ok: false, error: 'Não pode conceder permissão superior' },
            origin,
          )
        }
      }

      const { hash, salt } = hashPassword(password)
      const user = {
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
      }
      users.push(user)
      writeUsers(users)

      if (teamId) {
        const nextTeams = teams.map((t) => {
          if (t.id !== teamId) return t
          const memberIds = Array.isArray(t.memberIds) ? [...t.memberIds] : []
          if (!memberIds.includes(user.id)) memberIds.push(user.id)
          return { ...t, memberIds }
        })
        store.saveTeams(nextTeams)
      }

      audit(store, auth, 'users.create', 'user', user.id, {
        email,
        role,
        teamId,
      })

      return send(
        201,
        { ok: true, user: publicUser(user, store.listTeams()) },
        origin,
      )
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Invite user ----
  if (p === '/admin/invites' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.invite', send, origin)) return true
    try {
      const body = await readBody(req)
      const name = String(body.name || '').trim()
      const email = String(body.email || '')
        .trim()
        .toLowerCase()
      const role = normalizeRole(body.role)
      const teamId = body.teamId || null
      const managerId = body.managerId || null
      const extras = Array.isArray(body.permissionExtras)
        ? body.permissionExtras.filter((x) => ALL_PERMISSIONS.includes(x))
        : []

      if (!name || !email) {
        return send(
          400,
          { ok: false, error: 'Informe nome e e-mail' },
          origin,
        )
      }
      if (!canAssignRole(auth.role, role)) {
        return send(
          403,
          { ok: false, error: 'Você não pode convidar este cargo' },
          origin,
        )
      }
      for (const perm of extras) {
        if (!hasPermission(auth.role, perm, auth.permissionExtras || [])) {
          return send(
            403,
            {
              ok: false,
              error: 'Não é possível conceder permissão superior à própria',
            },
            origin,
          )
        }
      }

      const users = ensureUsers()
      if (users.some((u) => u.email === email && accountStatus(u) !== 'ARCHIVED')) {
        return send(409, { ok: false, error: 'E-mail já cadastrado' }, origin)
      }

      const settings = store.getSettings()
      const token = newInviteToken()
      const invite = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        teamId,
        managerId,
        permissionExtras: extras,
        token_hash: hashToken(token),
        status: 'PENDING',
        invitedBy: auth.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + (settings.inviteExpiryHours || 72) * 3600_000,
        ).toISOString(),
        accepted_at: null,
        revoked_at: null,
      }
      const invites = store.listInvites()
      invites.unshift(invite)
      store.saveInvites(invites)

      const placeholder = {
        id: crypto.randomUUID(),
        name,
        email,
        role,
        status: 'INVITED',
        active: false,
        teamId,
        managerId,
        permissionExtras: extras,
        password_hash: '',
        password_salt: '',
        created_at: new Date().toISOString(),
        invited_at: invite.created_at,
        inviteId: invite.id,
      }
      users.push(placeholder)
      writeUsers(users)

      if (teamId) {
        const teams = store.listTeams()
        const t = teams.find((x) => x.id === teamId)
        if (t && !t.memberIds.includes(placeholder.id)) {
          t.memberIds.push(placeholder.id)
          t.updated_at = new Date().toISOString()
          store.saveTeams(teams)
        }
      }

      audit(store, auth, 'users.invite', 'user', placeholder.id, {
        email,
        role,
        teamId,
      })

      store.saveNotifications([
        {
          id: crypto.randomUUID(),
          userId: auth.id,
          type: 'invite_sent',
          title: 'Convite enviado',
          body: `Convite para ${name} (${email})`,
          read: false,
          created_at: new Date().toISOString(),
        },
        ...store.listNotifications(),
      ].slice(0, 500))

      return send(
        201,
        {
          ok: true,
          invite: {
            id: invite.id,
            email: invite.email,
            name: invite.name,
            role: invite.role,
            status: invite.status,
            expires_at: invite.expires_at,
            created_at: invite.created_at,
          },
          // Link só quando e-mail de convite não está configurado
          inviteLink: `${process.env.ADMIN_APP_URL || 'http://127.0.0.1:5174'}/#/aceitar-convite?token=${token}`,
          emailConfigured: Boolean(process.env.SMTP_URL || process.env.RESEND_API_KEY),
        },
        origin,
      )
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  if (p === '/admin/invites' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.view', send, origin)) return true
    const invites = store.listInvites().map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      role: i.role,
      status: i.status,
      expires_at: i.expires_at,
      created_at: i.created_at,
      accepted_at: i.accepted_at,
      revoked_at: i.revoked_at,
    }))
    return send(200, { ok: true, invites }, origin)
  }

  const inviteAction = p.match(/^\/admin\/invites\/([^/]+)\/(revoke|resend)$/)
  if (inviteAction && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.invite', send, origin)) return true
    const id = decodeURIComponent(inviteAction[1])
    const action = inviteAction[2]
    const invites = store.listInvites()
    const idx = invites.findIndex((i) => i.id === id)
    if (idx < 0) return send(404, { ok: false, error: 'Convite não encontrado' }, origin)
    const invite = invites[idx]
    if (action === 'revoke') {
      invite.status = 'REVOKED'
      invite.revoked_at = new Date().toISOString()
      invites[idx] = invite
      store.saveInvites(invites)
      audit(store, auth, 'users.invite.revoke', 'invite', id, { email: invite.email })
      return send(200, { ok: true, invite: { id, status: invite.status } }, origin)
    }
    if (invite.status !== 'PENDING') {
      return send(400, { ok: false, error: 'Só é possível reenviar convites pendentes' }, origin)
    }
    const token = newInviteToken()
    const settings = store.getSettings()
    invite.token_hash = hashToken(token)
    invite.expires_at = new Date(
      Date.now() + (settings.inviteExpiryHours || 72) * 3600_000,
    ).toISOString()
    invites[idx] = invite
    store.saveInvites(invites)
    audit(store, auth, 'users.invite.resend', 'invite', id, { email: invite.email })
    return send(
      200,
      {
        ok: true,
        inviteLink: `${process.env.ADMIN_APP_URL || 'http://127.0.0.1:5174'}/#/aceitar-convite?token=${token}`,
      },
      origin,
    )
  }

  // ---- Accept invite (público autenticado por token) ----
  if (p === '/admin/invites/accept' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const token = String(body.token || '')
      const password = String(body.password || '')
      const name = String(body.name || '').trim()
      if (!token || password.length < 8) {
        return send(
          400,
          {
            ok: false,
            error: 'Informe o token e uma senha com no mínimo 8 caracteres',
          },
          origin,
        )
      }
      const tokenHash = hashToken(token)
      const invites = store.listInvites()
      const invite = invites.find((i) => i.token_hash === tokenHash)
      if (!invite) {
        return send(404, { ok: false, error: 'Convite inválido' }, origin)
      }
      if (invite.status === 'REVOKED') {
        return send(410, { ok: false, error: 'Convite revogado' }, origin)
      }
      if (invite.status === 'ACCEPTED') {
        return send(410, { ok: false, error: 'Convite já utilizado' }, origin)
      }
      if (new Date(invite.expires_at).getTime() < Date.now()) {
        invite.status = 'EXPIRED'
        store.saveInvites(invites)
        return send(410, { ok: false, error: 'Convite expirado' }, origin)
      }

      const users = ensureUsers()
      let user = users.find((u) => u.email === invite.email)
      const { hash, salt } = hashPassword(password)
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          email: invite.email,
          created_at: new Date().toISOString(),
        }
        users.push(user)
      }
      user.name = name || invite.name
      user.email = invite.email
      user.role = normalizeRole(invite.role)
      user.status = 'ACTIVE'
      user.active = true
      user.teamId = invite.teamId
      user.managerId = invite.managerId
      user.permissionExtras = invite.permissionExtras || []
      user.password_hash = hash
      user.password_salt = salt
      user.inviteId = invite.id
      writeUsers(users)

      invite.status = 'ACCEPTED'
      invite.accepted_at = new Date().toISOString()
      invite.token_hash = hashToken(crypto.randomBytes(32).toString('hex'))
      store.saveInvites(invites)

      audit(
        store,
        { id: user.id, email: user.email, name: user.name },
        'users.invite.accept',
        'user',
        user.id,
        { email: user.email },
      )

      const now = Math.floor(Date.now() / 1000)
      const jti = crypto.randomUUID()
      const jwt = signJwt({
        id: user.id,
        email: user.email,
        name: user.name,
        role: normalizeRole(user.role),
        jti,
        iat: now,
        exp: now + TOKEN_TTL_SEC,
      })
      const sessions = store.listSessions()
      sessions.unshift({
        id: jti,
        userId: user.id,
        created_at: new Date().toISOString(),
        expires_at: new Date((now + TOKEN_TTL_SEC) * 1000).toISOString(),
        revoked: false,
        userAgent: req.headers['user-agent'] || '',
        ip: req.socket?.remoteAddress || '',
      })
      store.saveSessions(sessions.slice(0, 2000))

      return send(
        200,
        {
          ok: true,
          token: jwt,
          user: publicUser(user, store.listTeams()),
        },
        origin,
      )
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- User detail / patch status ----
  const userMatch = p.match(/^\/admin\/users\/([^/]+)$/)
  if (userMatch && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.view', send, origin)) return true
    const id = decodeURIComponent(userMatch[1])
    const user = ensureUsers().find((u) => u.id === id)
    if (!user) return send(404, { ok: false, error: 'Usuário não encontrado' }, origin)
    const sessions = store
      .listSessions()
      .filter((s) => s.userId === id && !s.revoked)
      .map((s) => ({
        id: s.id,
        created_at: s.created_at,
        expires_at: s.expires_at,
        userAgent: s.userAgent,
      }))
    const auditTrail = store
      .listAudit()
      .filter((a) => a.resourceId === id || a.actorId === id)
      .slice(0, 50)
    return send(
      200,
      {
        ok: true,
        user: {
          ...publicUser(user, store.listTeams()),
          permissions: effectivePermissions(user),
        },
        sessions,
        audit: auditTrail,
      },
      origin,
    )
  }

  if (userMatch && req.method === 'PATCH') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    try {
      const id = decodeURIComponent(userMatch[1])
      const body = await readBody(req)
      const users = ensureUsers()
      const idx = users.findIndex((u) => u.id === id)
      if (idx < 0) return send(404, { ok: false, error: 'Usuário não encontrado' }, origin)
      const target = users[idx]
      const isSelf = auth.id === id

      if (isSelf) {
        if (typeof body.name === 'string' && body.name.trim()) {
          target.name = body.name.trim()
        }
        if (typeof body.password === 'string' && body.password) {
          if (body.password.length < 8) {
            return send(400, { ok: false, error: 'Senha mínima: 8 caracteres' }, origin)
          }
          const { hash, salt } = hashPassword(body.password)
          target.password_hash = hash
          target.password_salt = salt
        }
        users[idx] = target
        writeUsers(users)
        return send(200, { ok: true, user: publicUser(target, store.listTeams()) }, origin)
      }

      if (!requirePerm(auth, 'users.edit', send, origin)) return true

      if (body.status === 'SUSPENDED' || body.status === 'ARCHIVED' || body.active === false) {
        if (!requirePerm(auth, 'users.suspend', send, origin)) return true
        const check = canSuspendOrArchiveUser(auth.role, target, auth.id, users)
        if (!check.ok) return send(400, { ok: false, error: check.error }, origin)
      }

      if (body.role) {
        if (!requirePerm(auth, 'roles.assign', send, origin)) return true
        const role = normalizeRole(body.role)
        if (!canAssignRole(auth.role, role)) {
          return send(403, { ok: false, error: 'Não pode atribuir este cargo' }, origin)
        }
        if (
          normalizeRole(target.role) === 'admin' &&
          role !== 'admin'
        ) {
          const check = canSuspendOrArchiveUser(auth.role, target, auth.id, users)
          if (!check.ok) return send(400, { ok: false, error: check.error }, origin)
        }
        target.role = role
      }

      if (typeof body.name === 'string' && body.name.trim()) target.name = body.name.trim()
      if (body.teamId !== undefined) target.teamId = body.teamId
      if (body.managerId !== undefined) target.managerId = body.managerId
      if (Array.isArray(body.permissionExtras)) {
        const extras = normalizePermissionExtras(
          target.role,
          body.permissionExtras,
        )
        for (const perm of extras) {
          if (!hasPermission(auth.role, perm, auth.permissionExtras || [])) {
            return send(
              403,
              { ok: false, error: 'Não pode conceder permissão superior' },
              origin,
            )
          }
        }
        target.permissionExtras = extras
      }
      if (body.status) {
        target.status = body.status
        target.active = body.status === 'ACTIVE'
      } else if (typeof body.active === 'boolean') {
        target.active = body.active
        target.status = body.active ? 'ACTIVE' : 'SUSPENDED'
      }

      users[idx] = target
      writeUsers(users)
      audit(store, auth, 'users.update', 'user', id, {
        status: target.status,
        role: target.role,
      })
      return send(200, { ok: true, user: publicUser(target, store.listTeams()) }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Revoke sessions ----
  const revokeSessions = p.match(/^\/admin\/users\/([^/]+)\/sessions\/revoke$/)
  if (revokeSessions && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'users.sessions.revoke', send, origin)) return true
    const id = decodeURIComponent(revokeSessions[1])
    if (id === auth.id) {
      return send(400, { ok: false, error: 'Use logout para encerrar sua sessão' }, origin)
    }
    const sessions = store.listSessions()
    let count = 0
    for (const s of sessions) {
      if (s.userId === id && !s.revoked) {
        s.revoked = true
        s.revoked_at = new Date().toISOString()
        count++
      }
    }
    store.saveSessions(sessions)
    audit(store, auth, 'users.sessions.revoke', 'user', id, { count })
    return send(200, { ok: true, revoked: count }, origin)
  }

  // ---- Teams ----
  if (p === '/admin/teams' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'teams.view', send, origin)) return true
    const users = ensureUsers()
    const teams = store.listTeams().map((t) => ({
      ...t,
      memberCount: (t.memberIds || []).length,
      members: (t.memberIds || [])
        .map((id) => {
          const u = users.find((x) => x.id === id)
          return u ? { id: u.id, name: u.name, email: u.email, role: normalizeRole(u.role) } : null
        })
        .filter(Boolean),
    }))
    return send(200, { ok: true, teams }, origin)
  }

  if (p === '/admin/teams' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'teams.manage', send, origin)) return true
    try {
      const body = await readBody(req)
      const name = String(body.name || '').trim()
      if (!name) return send(400, { ok: false, error: 'Informe o nome da equipe' }, origin)
      const teams = store.listTeams()
      const team = {
        id: crypto.randomUUID(),
        key: name.toLowerCase().replace(/\s+/g, '_').slice(0, 40),
        name,
        leaderId: body.leaderId || null,
        memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      teams.push(team)
      store.saveTeams(teams)
      audit(store, auth, 'teams.create', 'team', team.id, { name })
      return send(201, { ok: true, team }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  const teamMatch = p.match(/^\/admin\/teams\/([^/]+)$/)
  if (teamMatch && req.method === 'PATCH') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'teams.manage', send, origin)) return true
    try {
      const id = decodeURIComponent(teamMatch[1])
      const body = await readBody(req)
      const teams = store.listTeams()
      const idx = teams.findIndex((t) => t.id === id)
      if (idx < 0) return send(404, { ok: false, error: 'Equipe não encontrada' }, origin)
      const team = { ...teams[idx] }
      if (typeof body.name === 'string' && body.name.trim()) team.name = body.name.trim()
      if (body.leaderId !== undefined) team.leaderId = body.leaderId
      if (Array.isArray(body.memberIds)) team.memberIds = body.memberIds
      if (typeof body.archived === 'boolean') team.archived = body.archived
      team.updated_at = new Date().toISOString()
      teams[idx] = team
      store.saveTeams(teams)
      audit(store, auth, 'teams.update', 'team', id, { name: team.name, archived: team.archived })
      return send(200, { ok: true, team }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Leads admin (paginado + pipeline) ----
  if (p === '/admin/leads' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.view', send, origin)) return true
    const { page, pageSize, q, sort, order } = parsePageParams(url.searchParams)
    const pipeline = url.searchParams.get('pipeline') || ''
    const assigneeId = url.searchParams.get('assigneeId') || ''
    const canSeeFull = hasPermission(auth.role, 'leads.export') ||
      hasPermission(auth.role, 'settings.manage')
    let leads = [...readLeads()]
    if (q) {
      leads = leads.filter(
        (l) =>
          String(l.nome || '').toLowerCase().includes(q) ||
          String(l.telefone || '').includes(q) ||
          String(l.marca || '').toLowerCase().includes(q) ||
          String(l.modelo || '').toLowerCase().includes(q),
      )
    }
    if (pipeline) {
      leads = leads.filter(
        (l) => (l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO')) === pipeline,
      )
    }
    if (assigneeId === 'none') {
      leads = leads.filter((l) => !l.assigneeId)
    } else if (assigneeId) {
      leads = leads.filter((l) => l.assigneeId === assigneeId)
    }
    leads.sort((a, b) => {
      const av = a[sort] || a.created_at
      const bv = b[sort] || b.created_at
      const cmp = String(av).localeCompare(String(bv))
      return order === 'asc' ? cmp : -cmp
    })
    const pageData = paginate(leads, page, pageSize)
    pageData.items = pageData.items.map((l) => ({
      ...l,
      telefone: canSeeFull ? l.telefone : maskPhone(l.telefone),
      pipeline: l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO'),
    }))
    return send(200, { ok: true, ...pageData }, origin)
  }

  const leadPatch = p.match(/^\/admin\/leads\/([^/]+)$/)
  if (leadPatch && req.method === 'PATCH') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const id = decodeURIComponent(leadPatch[1])
      const body = await readBody(req)
      const leads = readLeads()
      const idx = leads.findIndex((l) => l.id === id)
      if (idx < 0) return send(404, { ok: false, error: 'Lead não encontrado' }, origin)
      const prev = leads[idx]
      const next = { ...prev }
      if (body.pipeline) {
        next.pipeline = body.pipeline
        if (['RECUSADO', 'PERDIDO'].includes(body.pipeline) && !body.lossReason && !prev.lossReason) {
          return send(400, { ok: false, error: 'Informe o motivo da perda/recusa' }, origin)
        }
      }
      if (body.lossReason) next.lossReason = body.lossReason
      if (body.assigneeId !== undefined) {
        if (!requirePerm(auth, 'leads.assign', send, origin)) return true
        next.assigneeId = body.assigneeId
      }
      if (body.notes) {
        next.activities = [
          {
            id: crypto.randomUUID(),
            type: 'note',
            body: String(body.notes).slice(0, 2000),
            at: new Date().toISOString(),
            by: auth.id,
          },
          ...(prev.activities || []),
        ].slice(0, 200)
      }
      if (body.status) next.status = body.status
      if (body.qualified !== undefined) next.qualified = Boolean(body.qualified)
      if (!next.contacted_at && (body.pipeline === 'EM_ATENDIMENTO' || body.status === 'finalizado')) {
        next.contacted_at = new Date().toISOString()
      }
      leads[idx] = next
      writeLeads(leads)
      audit(store, auth, 'leads.update', 'lead', id, {
        pipeline: next.pipeline,
        assigneeId: next.assigneeId,
      })
      return send(200, { ok: true, lead: next }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Vehicles (from leads + store) ----
  if (p === '/admin/vehicles' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'vehicles.view', send, origin)) return true
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    const fromLeads = readLeads().map(vehicleFromLead)
    const stored = store.listVehicles()
    const byId = new Map()
    for (const v of fromLeads) byId.set(v.id, v)
    for (const v of stored) byId.set(v.id, { ...byId.get(v.id), ...v })
    let vehicles = [...byId.values()]
    if (q) {
      vehicles = vehicles.filter(
        (v) =>
          String(v.marca).toLowerCase().includes(q) ||
          String(v.modelo).toLowerCase().includes(q) ||
          String(v.ownerName).toLowerCase().includes(q),
      )
    }
    vehicles.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    return send(200, { ok: true, ...paginate(vehicles, page, pageSize) }, origin)
  }

  // ---- Evaluations ----
  if (p === '/admin/evaluations' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (
      !hasPermission(auth.role, 'vehicles.evaluate') &&
      !hasPermission(auth.role, 'vehicles.view')
    ) {
      return send(403, { ok: false, error: 'Sem permissão' }, origin)
    }
    const { page, pageSize } = parsePageParams(url.searchParams)
    const items = store
      .listEvaluations()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  if (p === '/admin/evaluations' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'vehicles.evaluate', send, origin)) return true
    try {
      const body = await readBody(req)
      const item = {
        id: crypto.randomUUID(),
        vehicleId: body.vehicleId || null,
        leadId: body.leadId || null,
        evaluatorId: auth.id,
        status: body.status || 'PENDENTE',
        checklist: body.checklist || {},
        notes: String(body.notes || '').slice(0, 4000),
        estimatedValue: Number(body.estimatedValue || 0),
        decision: body.decision || null,
        decisionReason: body.decisionReason || null,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const all = store.listEvaluations()
      all.unshift(item)
      store.saveEvaluations(all)
      audit(store, auth, 'evaluations.create', 'evaluation', item.id, {
        leadId: item.leadId,
        status: item.status,
      })
      return send(201, { ok: true, evaluation: item }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Acquisitions ----
  if (p === '/admin/acquisitions' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'acquisitions.view', send, origin)) return true
    const { page, pageSize } = parsePageParams(url.searchParams)
    const canDetails = hasPermission(auth.role, 'finance.view_details')
    let items = store.listAcquisitions()
    items = items.map((a) => {
      if (canDetails) return a
      return { ...a, purchaseValue: null, extraCosts: null }
    })
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  if (p === '/admin/acquisitions' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'acquisitions.propose', send, origin)) return true
    try {
      const body = await readBody(req)
      const settings = store.getSettings()
      const purchaseValue = Number(body.purchaseValue || 0)
      const item = {
        id: crypto.randomUUID(),
        leadId: body.leadId || null,
        vehicleId: body.vehicleId || null,
        assigneeId: body.assigneeId || auth.id,
        stage: body.stage || 'EM_ANALISE',
        purchaseValue,
        extraCosts: Number(body.extraCosts || 0),
        createdBy: auth.id,
        approvedBy: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (
        purchaseValue > (settings.approvalLimits?.selfApproveMax || 0) &&
        body.stage === 'APROVADO'
      ) {
        return send(
          400,
          {
            ok: false,
            error: 'Proposta acima da alçada exige aprovador distinto',
          },
          origin,
        )
      }
      const all = store.listAcquisitions()
      all.unshift(item)
      store.saveAcquisitions(all)
      audit(store, auth, 'acquisitions.create', 'acquisition', item.id, {
        stage: item.stage,
      })
      return send(201, { ok: true, acquisition: item }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  const acqMatch = p.match(/^\/admin\/acquisitions\/([^/]+)$/)
  if (acqMatch && req.method === 'PATCH') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    try {
      const id = decodeURIComponent(acqMatch[1])
      const body = await readBody(req)
      const all = store.listAcquisitions()
      const idx = all.findIndex((a) => a.id === id)
      if (idx < 0) return send(404, { ok: false, error: 'Aquisição não encontrada' }, origin)
      const item = { ...all[idx] }
      if (body.stage === 'APROVADO') {
        if (!requirePerm(auth, 'acquisitions.approve', send, origin)) return true
        if (item.createdBy === auth.id && Number(item.purchaseValue || 0) > 0) {
          const settings = store.getSettings()
          if (Number(item.purchaseValue) > (settings.approvalLimits?.selfApproveMax || 0)) {
            return send(
              403,
              {
                ok: false,
                error: 'Quem criou a proposta não pode ser o único aprovador',
              },
              origin,
            )
          }
        }
        item.approvedBy = auth.id
        item.approved_at = new Date().toISOString()
      } else if (body.stage && !requirePerm(auth, 'acquisitions.propose', send, origin)) {
        return true
      }
      if (body.stage) item.stage = body.stage
      if (body.purchaseValue !== undefined && hasPermission(auth.role, 'finance.edit')) {
        item.purchaseValue = Number(body.purchaseValue)
      }
      if (body.assigneeId !== undefined) item.assigneeId = body.assigneeId
      if (body.reason) item.reason = String(body.reason).slice(0, 1000)
      item.updated_at = new Date().toISOString()
      all[idx] = item
      store.saveAcquisitions(all)

      if (item.stage === 'COMPRADO' && item.vehicleId) {
        const inv = store.listInventory()
        if (!inv.some((i) => i.vehicleId === item.vehicleId)) {
          inv.unshift({
            id: crypto.randomUUID(),
            vehicleId: item.vehicleId,
            acquisitionId: item.id,
            status: 'EM_PREPARACAO',
            entry_at: new Date().toISOString(),
            acquisitionCost: item.purchaseValue,
            prepCosts: item.extraCosts || 0,
            listPrice: null,
            created_at: new Date().toISOString(),
          })
          store.saveInventory(inv)
        }
      }

      audit(store, auth, 'acquisitions.update', 'acquisition', id, {
        stage: item.stage,
      })
      return send(200, { ok: true, acquisition: item }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Inventory / Sales / Finance ----
  if (p === '/admin/inventory' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'inventory.view', send, origin)) return true
    const { page, pageSize } = parsePageParams(url.searchParams)
    const canFinance = hasPermission(auth.role, 'finance.view_details')
    const items = store.listInventory().map((i) => {
      const days = Math.floor(
        (Date.now() - new Date(i.entry_at || i.created_at).getTime()) / 86400000,
      )
      const row = { ...i, daysInStock: days }
      if (!canFinance) {
        row.acquisitionCost = null
        row.prepCosts = null
      }
      return row
    })
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  if (p === '/admin/catalog' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'inventory.manage', send, origin)) return true
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let items = [...store.listCatalog()]
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
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  if (p === '/admin/catalog' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'inventory.manage', send, origin)) return true
    try {
      const body = await readBody(req)
      const fields = sanitizeCatalogInput(body)
      if (!fields.marca || !fields.modelo) {
        return send(400, { ok: false, error: 'Informe marca e modelo' }, origin)
      }
      const now = new Date().toISOString()
      const item = {
        id: crypto.randomUUID(),
        created_at: now,
        ...fields,
        updated_at: now,
      }
      const all = store.listCatalog()
      all.unshift(item)
      store.saveCatalog(all)
      audit(store, auth, 'catalog.create', 'catalog', item.id, {
        marca: item.marca,
        modelo: item.modelo,
      })
      return send(201, { ok: true, vehicle: item }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  {
    const catMatch = p.match(/^\/admin\/catalog\/([^/]+)$/)
    if (catMatch && req.method === 'PATCH') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'inventory.manage', send, origin)) return true
      try {
        const id = decodeURIComponent(catMatch[1])
        const all = store.listCatalog()
        const idx = all.findIndex((v) => v.id === id)
        if (idx < 0) {
          return send(
            404,
            { ok: false, error: 'Veículo não encontrado' },
            origin,
          )
        }
        const body = await readBody(req)
        const next = {
          ...all[idx],
          ...sanitizeCatalogInput(body, all[idx]),
          id: all[idx].id,
          created_at: all[idx].created_at,
        }
        all[idx] = next
        store.saveCatalog(all)
        audit(store, auth, 'catalog.update', 'catalog', id, {
          published: next.published,
        })
        return send(200, { ok: true, vehicle: next }, origin)
      } catch {
        return send(400, { ok: false, error: 'JSON inválido' }, origin)
      }
    }
    if (catMatch && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'inventory.manage', send, origin)) return true
      const id = decodeURIComponent(catMatch[1])
      const all = store.listCatalog()
      const next = all.filter((v) => v.id !== id)
      if (next.length === all.length) {
        return send(404, { ok: false, error: 'Veículo não encontrado' }, origin)
      }
      store.saveCatalog(next)
      audit(store, auth, 'catalog.delete', 'catalog', id, {})
      return send(200, { ok: true }, origin)
    }
  }

  if (p === '/admin/sales' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'sales.view', send, origin)) return true
    const { page, pageSize } = parsePageParams(url.searchParams)
    return send(
      200,
      { ok: true, ...paginate(store.listSales(), page, pageSize) },
      origin,
    )
  }

  if (p === '/admin/finance/summary' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'finance.view_summary', send, origin)) return true
    const details = hasPermission(auth.role, 'finance.view_details')
    const acquisitions = store.listAcquisitions().filter((a) => a.stage === 'COMPRADO')
    const sales = store.listSales().filter((s) => s.status === 'COMPLETED')
    const purchase = acquisitions.reduce((s, a) => s + Number(a.purchaseValue || 0), 0)
    const extras = acquisitions.reduce((s, a) => s + Number(a.extraCosts || 0), 0)
    const revenue = sales.reduce((s, x) => s + Number(x.saleValue || 0), 0)
    return send(
      200,
      {
        ok: true,
        summary: {
          purchaseTotal: details ? purchase : null,
          extraCosts: details ? extras : null,
          salesTotal: details ? revenue : null,
          grossMargin: details ? revenue - purchase - extras : null,
          boughtCount: acquisitions.length,
          soldCount: sales.length,
        },
        moduleNote:
          'Visão gerencial integrada a aquisições e vendas — não é contabilidade completa.',
      },
      origin,
    )
  }

  // ---- Marketing summary (reusa dados existentes) ----
  if (p === '/admin/marketing/summary' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'marketing.view', send, origin)) return true
    return send(
      200,
      {
        ok: true,
        summary: {
          note: 'Use o Painel de Marketing completo para publicar e agendar.',
          deepLinkSection: 'marketing',
        },
      },
      origin,
    )
  }

  // ---- Reports / export ----
  if (p === '/admin/reports/overview' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'reports.view', send, origin)) return true
    const leads = readLeads()
    const byPipeline = {}
    for (const l of leads) {
      const stage = l.pipeline || (l.qualified ? 'QUALIFICADO' : 'NOVO')
      byPipeline[stage] = (byPipeline[stage] || 0) + 1
    }
    return send(
      200,
      {
        ok: true,
        report: {
          totalLeads: leads.length,
          qualified: leads.filter((l) => l.qualified).length,
          byPipeline,
          evaluations: store.listEvaluations().length,
          acquisitions: store.listAcquisitions().length,
          inventory: store.listInventory().length,
          sales: store.listSales().length,
        },
      },
      origin,
    )
  }

  if (p === '/admin/exports' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (
      !hasPermission(auth.role, 'reports.export', auth.permissionExtras || []) &&
      !hasPermission(auth.role, 'leads.export', auth.permissionExtras || [])
    ) {
      return send(403, { ok: false, error: 'Sem permissão' }, origin)
    }
    try {
      const body = await readBody(req)
      const type = body.type || 'leads'
      if (type === 'leads' && !hasPermission(auth.role, 'leads.export') && !hasPermission(auth.role, 'reports.export')) {
        return send(403, { ok: false, error: 'Sem permissão' }, origin)
      }
      const job = {
        id: crypto.randomUUID(),
        type,
        status: 'READY',
        filters: body.filters || {},
        createdBy: auth.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        downloadToken: crypto.randomBytes(16).toString('base64url'),
      }
      let rows = []
      if (type === 'leads') {
        rows = readLeads().map((l) => ({
          id: l.id,
          nome: l.nome,
          telefone: maskPhone(l.telefone),
          marca: l.marca,
          modelo: l.modelo,
          qualified: l.qualified,
          pipeline: l.pipeline || '',
          created_at: l.created_at,
        }))
      }
      job.rowCount = rows.length
      job.csv = toCsv(rows)
      const exports = store.listExports()
      exports.unshift(job)
      store.saveExports(exports.slice(0, 100))
      audit(store, auth, 'exports.create', 'export', job.id, {
        type,
        rowCount: job.rowCount,
        filters: job.filters,
      })
      return send(
        201,
        {
          ok: true,
          export: {
            id: job.id,
            status: job.status,
            type: job.type,
            rowCount: job.rowCount,
            expires_at: job.expires_at,
            downloadPath: `/admin/exports/${job.id}/download?token=${job.downloadToken}`,
          },
        },
        origin,
      )
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  const exportDl = p.match(/^\/admin\/exports\/([^/]+)\/download$/)
  if (exportDl && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    const id = decodeURIComponent(exportDl[1])
    const token = url.searchParams.get('token') || ''
    const job = store.listExports().find((e) => e.id === id)
    if (!job || job.downloadToken !== token) {
      return send(404, { ok: false, error: 'Exportação não encontrada' }, origin)
    }
    if (new Date(job.expires_at).getTime() < Date.now()) {
      return send(410, { ok: false, error: 'Exportação expirada' }, origin)
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${job.type}-${id}.csv"`,
      'Access-Control-Allow-Origin': origin || '*',
    })
    res.end(job.csv || '')
    return true
  }

  // ---- Audit ----
  if (p === '/admin/audit' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'audit.view', send, origin)) return true
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    let items = store.listAudit()
    if (q) {
      items = items.filter(
        (a) =>
          String(a.action).includes(q) ||
          String(a.actorEmail || '').includes(q) ||
          String(a.resourceId || '').includes(q),
      )
    }
    const action = url.searchParams.get('action')
    if (action) items = items.filter((a) => a.action === action)
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  // ---- Settings ----
  if (p === '/admin/settings' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'settings.view', send, origin)) return true
    return send(200, { ok: true, settings: store.getSettings() }, origin)
  }

  if (p === '/admin/settings' && req.method === 'PATCH') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'settings.manage', send, origin)) return true
    try {
      const body = await readBody(req)
      const prev = store.getSettings()
      const next = {
        ...prev,
        ...body,
        version: Number(prev.version || 1) + 1,
        updated_at: new Date().toISOString(),
        updatedBy: auth.id,
      }
      if (body.timezone) next.timezone = String(body.timezone)
      if (body.name) next.name = String(body.name).slice(0, 120)
      store.saveSettings(next)
      audit(store, auth, 'settings.update', 'settings', 'org', {
        version: next.version,
      })
      return send(200, { ok: true, settings: next }, origin)
    } catch {
      return send(400, { ok: false, error: 'JSON inválido' }, origin)
    }
  }

  // ---- Notifications ----
  if (p === '/admin/notifications' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    const items = store
      .listNotifications()
      .filter((n) => n.userId === auth.id || !n.userId)
      .slice(0, 50)
    return send(200, { ok: true, notifications: items }, origin)
  }

  const notifRead = p.match(/^\/admin\/notifications\/([^/]+)\/read$/)
  if (notifRead && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    const id = decodeURIComponent(notifRead[1])
    const items = store.listNotifications()
    const idx = items.findIndex((n) => n.id === id)
    if (idx >= 0) {
      items[idx].read = true
      store.saveNotifications(items)
    }
    return send(200, { ok: true }, origin)
  }

  // ---- Global search ----
  if (p === '/admin/search' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    const q = String(url.searchParams.get('q') || '')
      .trim()
      .toLowerCase()
    if (q.length < 2) {
      return send(200, { ok: true, results: [] }, origin)
    }
    const results = []
    if (hasPermission(auth.role, 'users.view')) {
      for (const u of ensureUsers()) {
        if (
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        ) {
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
      for (const l of readLeads()) {
        if (
          String(l.nome || '')
            .toLowerCase()
            .includes(q) ||
          String(l.modelo || '')
            .toLowerCase()
            .includes(q)
        ) {
          results.push({
            type: 'lead',
            id: l.id,
            title: l.nome,
            subtitle: `${l.marca || ''} ${l.modelo || ''}`.trim(),
          })
        }
      }
    }
    return send(200, { ok: true, results: results.slice(0, 30) }, origin)
  }

  // ---- Health ----
  if (p === '/admin/health' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'system.health.view', send, origin)) return true
    return send(
      200,
      {
        ok: true,
        health: {
          api: 'ok',
          storage: 'ok',
          version: process.env.APP_VERSION || 'dev',
          timezone: store.getSettings().timezone,
          queues: {
            marketing: 'local',
            exports: store.listExports().filter((e) => e.status === 'PENDING').length,
          },
          checkedAt: new Date().toISOString(),
        },
      },
      origin,
    )
  }

  // ---- Actions / pendências ----
  if (p === '/admin/actions' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'admin.dashboard.view', send, origin)) return true
    const leads = readLeads()
    const actions = []
    for (const l of leads.filter((x) => !x.assigneeId && x.status !== 'finalizado').slice(0, 20)) {
      actions.push({
        type: 'lead_unassigned',
        id: l.id,
        title: `Lead sem responsável: ${l.nome}`,
        href: 'leads',
      })
    }
    for (const e of store.listEvaluations().filter((x) => x.status === 'PENDENTE').slice(0, 20)) {
      actions.push({
        type: 'evaluation_pending',
        id: e.id,
        title: 'Avaliação pendente',
        href: 'avaliacoes',
      })
    }
    for (const a of store
      .listAcquisitions()
      .filter((x) => x.stage === 'PROPOSTA_ENVIADA')
      .slice(0, 20)) {
      actions.push({
        type: 'proposal_approval',
        id: a.id,
        title: 'Proposta aguardando aprovação',
        href: 'aquisicoes',
      })
    }
    return send(200, { ok: true, actions }, origin)
  }

  // ---- Compra / Venda (C/V) ----
  if (p === '/admin/cv' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.view', send, origin)) return true
    const { page, pageSize, q } = parsePageParams(url.searchParams)
    const statusFilter = url.searchParams.get('status') || ''
    let items = store.listCv().map((d) => ({
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
    return send(200, { ok: true, ...paginate(items, page, pageSize) }, origin)
  }

  if (p === '/admin/cv/from-lead' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const body = await readBody(req)
      const leadId = String(body.leadId || '').trim()
      if (!leadId) {
        return send(400, { ok: false, error: 'leadId obrigatório' }, origin)
      }
      const leads = readLeads()
      const lead = leads.find((l) => String(l.id) === leadId)
      if (!lead) {
        return send(404, { ok: false, error: 'Lead não encontrado' }, origin)
      }
      const all = store.listCv()
      const existing = all.find((d) => d.leadId === leadId)
      if (existing) {
        return send(
          200,
          {
            ok: true,
            deal: { ...existing, status: normalizeCvStatus(existing.status) },
            existing: true,
          },
          origin,
        )
      }
      const now = new Date().toISOString()
      const item = {
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
      store.saveCv(all)
      const idx = leads.findIndex((l) => String(l.id) === leadId)
      if (idx >= 0) {
        leads[idx] = {
          ...leads[idx],
          status: 'finalizado',
          finalized_at: now,
          contacted_at: leads[idx].contacted_at || now,
        }
        writeLeads(leads)
      }
      audit(store, auth, 'cv.from_lead', 'cv', item.id, { leadId })
      return send(201, { ok: true, deal: item, existing: false }, origin)
    } catch (e) {
      return send(400, { ok: false, error: String(e) }, origin)
    }
  }

  if (p === '/admin/cv' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const body = await readBody(req)
      if (!body.status) body.status = 'compra'
      const fields = sanitizeCvInput(body)
      if (!fields.marca && !fields.modelo && !fields.cliente_nome) {
        return send(
          400,
          { ok: false, error: 'Informe ao menos cliente ou veículo' },
          origin,
        )
      }
      const now = new Date().toISOString()
      const item = {
        id: makeCvId(),
        created_at: now,
        docs: [],
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        updated_at: now,
      }
      const all = store.listCv()
      all.unshift(item)
      store.saveCv(all)
      audit(store, auth, 'cv.create', 'cv', item.id, {
        marca: item.marca,
        modelo: item.modelo,
      })
      return send(201, { ok: true, deal: item }, origin)
    } catch (e) {
      return send(400, { ok: false, error: String(e) }, origin)
    }
  }

  {
    const cvMatch = p.match(/^\/admin\/cv\/([^/]+)$/)
    if (cvMatch && req.method === 'GET') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.view', send, origin)) return true
      const id = decodeURIComponent(cvMatch[1])
      const item = store.listCv().find((d) => d.id === id)
      if (!item) {
        return send(404, { ok: false, error: 'Caso não encontrado' }, origin)
      }
      return send(200, { ok: true, deal: item }, origin)
    }
    if (cvMatch && req.method === 'PATCH') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      try {
        const id = decodeURIComponent(cvMatch[1])
        const all = store.listCv()
        const idx = all.findIndex((d) => d.id === id)
        if (idx < 0) {
          return send(404, { ok: false, error: 'Caso não encontrado' }, origin)
        }
        const body = await readBody(req)
        const prev = all[idx]
        const next = {
          ...prev,
          ...sanitizeCvInput(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          docs: prev.docs || [],
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
        }
        all[idx] = next
        store.saveCv(all)
        audit(store, auth, 'cv.update', 'cv', id, {})
        return send(200, { ok: true, deal: next }, origin)
      } catch (e) {
        return send(400, { ok: false, error: String(e) }, origin)
      }
    }
    if (cvMatch && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const id = decodeURIComponent(cvMatch[1])
      const all = store.listCv()
      const next = all.filter((d) => d.id !== id)
      if (next.length === all.length) {
        return send(404, { ok: false, error: 'Caso não encontrado' }, origin)
      }
      store.saveCv(next)
      audit(store, auth, 'cv.delete', 'cv', id, {})
      return send(200, { ok: true }, origin)
    }
  }

  {
    const cvDocUp = p.match(/^\/admin\/cv\/([^/]+)\/documents$/)
    if (cvDocUp && req.method === 'POST') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const dealId = decodeURIComponent(cvDocUp[1])
      const all = store.listCv()
      const idx = all.findIndex((d) => d.id === dealId)
      if (idx < 0) {
        return send(404, { ok: false, error: 'Caso não encontrado' }, origin)
      }
      try {
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const raw = Buffer.concat(chunks)
        const ctype = req.headers['content-type'] || ''
        let fileBuf
        let filename = 'documento.bin'
        let kind = 'outro'
        if (ctype.includes('multipart/form-data')) {
          const boundary = ctype.split('boundary=')[1]
          const parts = raw.toString('latin1').split(`--${boundary}`)
          for (const part of parts) {
            if (part.includes('name="kind"') && !part.includes('filename=')) {
              const headerEnd = part.indexOf('\r\n\r\n')
              if (headerEnd >= 0) {
                let body = part.slice(headerEnd + 4)
                if (body.endsWith('\r\n')) body = body.slice(0, -2)
                kind = body.trim()
              }
              continue
            }
            if (!part.includes('name="file"')) continue
            const headerEnd = part.indexOf('\r\n\r\n')
            if (headerEnd < 0) continue
            const headers = part.slice(0, headerEnd)
            const nameMatch = headers.match(/filename="([^"]+)"/)
            if (nameMatch) filename = nameMatch[1]
            let body = part.slice(headerEnd + 4)
            if (body.endsWith('\r\n')) body = body.slice(0, -2)
            fileBuf = Buffer.from(body, 'latin1')
          }
        } else {
          fileBuf = raw
        }
        if (!fileBuf?.length) {
          return send(400, { ok: false, error: 'Arquivo obrigatório' }, origin)
        }
        if (fileBuf.length > 8 * 1024 * 1024) {
          return send(
            400,
            { ok: false, error: 'Arquivo muito grande (máx. 8MB)' },
            origin,
          )
        }
        const isJpeg =
          fileBuf[0] === 0xff && fileBuf[1] === 0xd8 && fileBuf[2] === 0xff
        const isPng =
          fileBuf[0] === 0x89 &&
          fileBuf[1] === 0x50 &&
          fileBuf[2] === 0x4e &&
          fileBuf[3] === 0x47
        const isPdf =
          fileBuf[0] === 0x25 &&
          fileBuf[1] === 0x50 &&
          fileBuf[2] === 0x44 &&
          fileBuf[3] === 0x46
        if (!isJpeg && !isPng && !isPdf) {
          return send(
            400,
            { ok: false, error: 'Use JPG, PNG ou PDF' },
            origin,
          )
        }
        const mime = isPdf
          ? 'application/pdf'
          : isPng
            ? 'image/png'
            : 'image/jpeg'
        const docKind =
          kind === 'compra' || kind === 'venda' ? kind : 'outro'
        const docId = crypto.randomUUID()
        const ext = isPdf ? 'pdf' : isPng ? 'png' : 'jpg'
        const storageName = `${docId}.${ext}`
        fs.writeFileSync(path.join(store.cvDocsDir, storageName), fileBuf)
        const apiBase = `${url.protocol}//${url.host}`
        const doc = {
          id: docId,
          kind: docKind,
          name: filename || `documento.${ext}`,
          mime,
          url: `${apiBase}/admin/cv/documents/file/${docId}`,
          size: fileBuf.length,
          uploaded_at: new Date().toISOString(),
          uploaded_by: auth.name,
          storageName,
        }
        const deal = all[idx]
        const docs = [...(deal.docs || []), doc]
        const next = {
          ...deal,
          docs,
          updated_at: new Date().toISOString(),
        }
        all[idx] = next
        store.saveCv(all)
        audit(store, auth, 'cv.doc.upload', 'cv', dealId, {
          docId,
          kind: docKind,
        })
        return send(201, { ok: true, deal: next, document: doc }, origin)
      } catch (e) {
        return send(400, { ok: false, error: String(e) }, origin)
      }
    }
  }

  {
    const cvDocDel = p.match(/^\/admin\/cv\/([^/]+)\/documents\/([^/]+)$/)
    if (cvDocDel && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const dealId = decodeURIComponent(cvDocDel[1])
      const docId = decodeURIComponent(cvDocDel[2])
      const all = store.listCv()
      const idx = all.findIndex((d) => d.id === dealId)
      if (idx < 0) {
        return send(404, { ok: false, error: 'Caso não encontrado' }, origin)
      }
      const deal = all[idx]
      const target = (deal.docs || []).find((d) => d.id === docId)
      const docs = (deal.docs || []).filter((d) => d.id !== docId)
      if (docs.length === (deal.docs || []).length) {
        return send(
          404,
          { ok: false, error: 'Documento não encontrado' },
          origin,
        )
      }
      if (target?.storageName) {
        try {
          fs.unlinkSync(path.join(store.cvDocsDir, target.storageName))
        } catch {
          /* ignore */
        }
      }
      const next = {
        ...deal,
        docs,
        updated_at: new Date().toISOString(),
      }
      all[idx] = next
      store.saveCv(all)
      audit(store, auth, 'cv.doc.delete', 'cv', dealId, { docId })
      return send(200, { ok: true, deal: next }, origin)
    }
  }

  {
    const cvFile = p.match(/^\/admin\/cv\/documents\/file\/([^/]+)$/)
    if (cvFile && req.method === 'GET') {
      const id = decodeURIComponent(cvFile[1])
      const all = store.listCv()
      let found = null
      for (const d of all) {
        found = (d.docs || []).find((x) => x.id === id) || null
        if (found) break
      }
      if (!found?.storageName) {
        return send(404, { ok: false, error: 'Arquivo não encontrado' }, origin)
      }
      const filePath = path.join(store.cvDocsDir, found.storageName)
      if (!fs.existsSync(filePath)) {
        return send(404, { ok: false, error: 'Arquivo não encontrado' }, origin)
      }
      const buf = fs.readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': found.mime || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': buf.length,
      })
      res.end(buf)
      return true
    }
  }

  // ---- Agenda + Avisos ----
  if (p === '/admin/agenda' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.view', send, origin)) return true
    try {
      const from = url.searchParams.get('from') || ''
      const to = url.searchParams.get('to') || ''
      let items = [...store.listAgenda()]
      if (from) items = items.filter((e) => e.date >= from)
      if (to) items = items.filter((e) => e.date <= to)
      items.sort((a, b) => {
        const d = String(a.date).localeCompare(String(b.date))
        if (d !== 0) return d
        return String(a.start_time || '').localeCompare(String(b.start_time || ''))
      })
      return send(200, { ok: true, items }, origin)
    } catch (e) {
      return send(500, { ok: false, error: String(e) }, origin)
    }
  }

  if (p === '/admin/agenda' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const body = await readBody(req)
      const fields = sanitizeAgendaEvent(body)
      if (!fields.title.trim()) {
        return send(400, { ok: false, error: 'Título obrigatório' }, origin)
      }
      const now = new Date().toISOString()
      const item = {
        id: makeAgendaId('ev'),
        created_at: now,
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        updated_at: now,
      }
      const all = store.listAgenda()
      all.unshift(item)
      store.saveAgenda(all)
      audit(store, auth, 'agenda.create', 'agenda', item.id, {
        title: item.title,
      })
      return send(201, { ok: true, event: item }, origin)
    } catch (e) {
      return send(400, { ok: false, error: String(e) }, origin)
    }
  }

  {
    const agMatch = p.match(/^\/admin\/agenda\/([^/]+)$/)
    if (agMatch && req.method === 'PATCH') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      try {
        const id = decodeURIComponent(agMatch[1])
        const all = store.listAgenda()
        const idx = all.findIndex((e) => e.id === id)
        if (idx < 0) {
          return send(404, { ok: false, error: 'Evento não encontrado' }, origin)
        }
        const body = await readBody(req)
        const prev = all[idx]
        const next = {
          ...prev,
          ...sanitizeAgendaEvent(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
        }
        all[idx] = next
        store.saveAgenda(all)
        audit(store, auth, 'agenda.update', 'agenda', id, {})
        return send(200, { ok: true, event: next }, origin)
      } catch (e) {
        return send(400, { ok: false, error: String(e) }, origin)
      }
    }
    if (agMatch && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const id = decodeURIComponent(agMatch[1])
      const all = store.listAgenda()
      const next = all.filter((e) => e.id !== id)
      if (next.length === all.length) {
        return send(404, { ok: false, error: 'Evento não encontrado' }, origin)
      }
      store.saveAgenda(next)
      audit(store, auth, 'agenda.delete', 'agenda', id, {})
      return send(200, { ok: true }, origin)
    }
  }

  if (p === '/admin/notices' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.view', send, origin)) return true
    const activeOnly = url.searchParams.get('active') === '1'
    let items = [...store.listNotices()]
    if (activeOnly) items = items.filter((n) => isNoticeVisible(n))
    items.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    })
    return send(200, { ok: true, items }, origin)
  }

  if (p === '/admin/notices' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const body = await readBody(req)
      const fields = sanitizeNotice(body)
      const now = new Date().toISOString()
      const item = {
        id: makeAgendaId('nt'),
        created_at: now,
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        updated_at: now,
      }
      const all = store.listNotices()
      all.unshift(item)
      store.saveNotices(all)
      audit(store, auth, 'notice.create', 'notice', item.id, {
        title: item.title,
      })
      return send(201, { ok: true, notice: item }, origin)
    } catch (e) {
      return send(400, { ok: false, error: String(e) }, origin)
    }
  }

  {
    const ntMatch = p.match(/^\/admin\/notices\/([^/]+)$/)
    if (ntMatch && req.method === 'PATCH') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      try {
        const id = decodeURIComponent(ntMatch[1])
        const all = store.listNotices()
        const idx = all.findIndex((n) => n.id === id)
        if (idx < 0) {
          return send(404, { ok: false, error: 'Aviso não encontrado' }, origin)
        }
        const body = await readBody(req)
        const prev = all[idx]
        const next = {
          ...prev,
          ...sanitizeNotice(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
        }
        all[idx] = next
        store.saveNotices(all)
        audit(store, auth, 'notice.update', 'notice', id, {})
        return send(200, { ok: true, notice: next }, origin)
      } catch (e) {
        return send(400, { ok: false, error: String(e) }, origin)
      }
    }
    if (ntMatch && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const id = decodeURIComponent(ntMatch[1])
      const all = store.listNotices()
      const next = all.filter((n) => n.id !== id)
      if (next.length === all.length) {
        return send(404, { ok: false, error: 'Aviso não encontrado' }, origin)
      }
      store.saveNotices(next)
      audit(store, auth, 'notice.delete', 'notice', id, {})
      return send(200, { ok: true }, origin)
    }
  }

  // ---- Pagamentos ----
  if (p === '/admin/payments' && req.method === 'GET') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.view', send, origin)) return true
    const doSync = url.searchParams.get('sync') !== '0'
    let items = [...store.listPayments()]
    if (doSync) {
      items = syncPaymentsFromDeals(store.listCv(), items)
      store.savePayments(items)
    }
    items.sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')),
    )
    return send(
      200,
      { ok: true, items, totals: sumPayments(items) },
      origin,
    )
  }

  if (p === '/admin/payments/sync' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    const items = syncPaymentsFromDeals(store.listCv(), store.listPayments())
    store.savePayments(items)
    audit(store, auth, 'payments.sync', 'payment', null, {
      count: items.length,
    })
    return send(
      200,
      { ok: true, items, totals: sumPayments(items) },
      origin,
    )
  }

  if (p === '/admin/payments' && req.method === 'POST') {
    if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
    if (!requirePerm(auth, 'leads.edit', send, origin)) return true
    try {
      const body = await readBody(req)
      body.source = body.source || 'manual'
      const fields = sanitizePaymentInput(body)
      if (!fields.amount || fields.amount <= 0) {
        return send(400, { ok: false, error: 'Informe um valor válido' }, origin)
      }
      const now = new Date().toISOString()
      const item = {
        id: makePaymentId(),
        created_at: now,
        created_by: auth.id,
        created_by_name: auth.name,
        ...fields,
        source: 'manual',
        updated_at: now,
      }
      const all = store.listPayments()
      all.unshift(item)
      store.savePayments(all)
      audit(store, auth, 'payments.create', 'payment', item.id, {
        amount: item.amount,
        direction: item.direction,
      })
      return send(201, { ok: true, payment: item }, origin)
    } catch (e) {
      return send(400, { ok: false, error: String(e) }, origin)
    }
  }

  {
    const payMatch = p.match(/^\/admin\/payments\/([^/]+)$/)
    if (payMatch && req.method === 'PATCH') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      try {
        const id = decodeURIComponent(payMatch[1])
        const all = store.listPayments()
        const idx = all.findIndex((x) => x.id === id)
        if (idx < 0) {
          return send(
            404,
            { ok: false, error: 'Pagamento não encontrado' },
            origin,
          )
        }
        const body = await readBody(req)
        const prev = all[idx]
        let next = {
          ...prev,
          ...sanitizePaymentInput(body, prev),
          id: prev.id,
          created_at: prev.created_at,
          created_by: prev.created_by,
          created_by_name: prev.created_by_name,
          source: prev.source,
          dealId: prev.dealId,
        }
        if (prev.source !== 'manual') {
          next = {
            ...next,
            amount: prev.amount,
            amount_label: prev.amount_label,
            direction: prev.direction,
            date:
              typeof body.date === 'string'
                ? body.date.trim() || prev.date
                : prev.date,
            description:
              typeof body.description === 'string'
                ? body.description.trim() || prev.description
                : prev.description,
            status:
              body.status === 'pendente' || body.status === 'pago'
                ? body.status
                : prev.status,
          }
        }
        all[idx] = next
        store.savePayments(all)
        audit(store, auth, 'payments.update', 'payment', id, {})
        return send(200, { ok: true, payment: next }, origin)
      } catch (e) {
        return send(400, { ok: false, error: String(e) }, origin)
      }
    }
    if (payMatch && req.method === 'DELETE') {
      if (!auth) return send(401, { ok: false, error: 'Não autenticado' }, origin)
      if (!requirePerm(auth, 'leads.edit', send, origin)) return true
      const id = decodeURIComponent(payMatch[1])
      const all = store.listPayments()
      const target = all.find((x) => x.id === id)
      if (!target) {
        return send(
          404,
          { ok: false, error: 'Pagamento não encontrado' },
          origin,
        )
      }
      if (target.source !== 'manual') {
        return send(
          400,
          {
            ok: false,
            error: 'Pagamentos de compra/venda só mudam pelo caso C/V',
          },
          origin,
        )
      }
      store.savePayments(all.filter((x) => x.id !== id))
      audit(store, auth, 'payments.delete', 'payment', id, {})
      return send(200, { ok: true }, origin)
    }
  }

  if (p.startsWith('/admin')) {
    return send(404, { ok: false, error: 'Rota admin não encontrada' }, origin)
  }
  return false
}

function buildAlerts(store, users, leads) {
  const alerts = []
  const suspended = users.filter((u) => accountStatus(u) === 'SUSPENDED').length
  if (suspended) {
    alerts.push({
      level: 'info',
      message: `${suspended} usuário(s) suspenso(s)`,
    })
  }
  const unassigned = leads.filter(
    (l) => !l.assigneeId && l.status !== 'finalizado',
  ).length
  if (unassigned) {
    alerts.push({
      level: 'warn',
      message: `${unassigned} lead(s) sem responsável`,
    })
  }
  const pendingInvites = store
    .listInvites()
    .filter((i) => i.status === 'PENDING').length
  if (pendingInvites) {
    alerts.push({
      level: 'info',
      message: `${pendingInvites} convite(s) pendente(s)`,
    })
  }
  return alerts
}

function toCsv(rows) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const escape = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join(
    '\n',
  )
}

export {
  publicUser,
  accountStatus,
  effectivePermissions,
  audit,
}
