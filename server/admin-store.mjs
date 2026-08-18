/**
 * Persistência do Painel Admin (arquivo JSON local).
 * Espelhado conceitualmente no Worker (KV).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DEFAULT_TEAMS = [
  { key: 'atendimento', name: 'Atendimento' },
  { key: 'compras', name: 'Compras / Aquisição' },
  { key: 'avaliacao', name: 'Avaliação' },
  { key: 'vendas', name: 'Vendas' },
  { key: 'marketing', name: 'Marketing' },
  { key: 'financeiro', name: 'Financeiro' },
  { key: 'administracao', name: 'Administração' },
]

const DEFAULT_SETTINGS = {
  name: 'Alpha Recupera',
  timezone: 'America/Sao_Paulo',
  businessHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  leadSlaMinutes: 60,
  lossReasons: [
    'Sem interesse',
    'Preço abaixo do esperado',
    'Documentação irregular',
    'Veículo fora do perfil',
    'Duplicado',
  ],
  approvalLimits: { proposeMax: 80000, selfApproveMax: 0 },
  sessionDays: 7,
  retentionDays: 365,
  inviteExpiryHours: 72,
  updated_at: null,
  version: 1,
}

export function createAdminStore(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const files = {
    teams: path.join(dataDir, 'teams.json'),
    invites: path.join(dataDir, 'invites.json'),
    audit: path.join(dataDir, 'audit.json'),
    sessions: path.join(dataDir, 'sessions.json'),
    settings: path.join(dataDir, 'org-settings.json'),
    notifications: path.join(dataDir, 'notifications.json'),
    vehicles: path.join(dataDir, 'vehicles.json'),
    evaluations: path.join(dataDir, 'evaluations.json'),
    acquisitions: path.join(dataDir, 'acquisitions.json'),
    inventory: path.join(dataDir, 'inventory.json'),
    catalog: path.join(dataDir, 'catalog.json'),
    sales: path.join(dataDir, 'sales.json'),
    exports: path.join(dataDir, 'exports.json'),
    cv: path.join(dataDir, 'cv.json'),
    agenda: path.join(dataDir, 'agenda.json'),
    notices: path.join(dataDir, 'notices.json'),
    payments: path.join(dataDir, 'payments.json'),
  }
  const cvDocsDir = path.join(dataDir, 'cv-docs')
  if (!fs.existsSync(cvDocsDir)) fs.mkdirSync(cvDocsDir, { recursive: true })

  for (const f of Object.values(files)) {
    if (!fs.existsSync(f)) {
      const empty = f.endsWith('org-settings.json')
        ? DEFAULT_SETTINGS
        : f.endsWith('teams.json')
          ? seedTeams()
          : []
      fs.writeFileSync(f, JSON.stringify(empty, null, 2), 'utf8')
    }
  }

  function readJson(file, fallback) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return data ?? fallback
    } catch {
      return fallback
    }
  }

  function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }

  function seedTeams() {
    const now = new Date().toISOString()
    return DEFAULT_TEAMS.map((t) => ({
      id: crypto.randomUUID(),
      key: t.key,
      name: t.name,
      leaderId: null,
      memberIds: [],
      archived: false,
      created_at: now,
      updated_at: now,
    }))
  }

  return {
    listTeams: () => readJson(files.teams, []),
    saveTeams: (teams) => writeJson(files.teams, teams),

    listInvites: () => readJson(files.invites, []),
    saveInvites: (invites) => writeJson(files.invites, invites),

    listAudit: () => readJson(files.audit, []),
    appendAudit: (entry) => {
      const all = readJson(files.audit, [])
      all.unshift(entry)
      writeJson(files.audit, all.slice(0, 5000))
    },

    listSessions: () => readJson(files.sessions, []),
    saveSessions: (sessions) => writeJson(files.sessions, sessions),

    getSettings: () => ({
      ...DEFAULT_SETTINGS,
      ...readJson(files.settings, {}),
    }),
    saveSettings: (settings) => writeJson(files.settings, settings),

    listNotifications: () => readJson(files.notifications, []),
    saveNotifications: (items) => writeJson(files.notifications, items),

    listVehicles: () => readJson(files.vehicles, []),
    saveVehicles: (items) => writeJson(files.vehicles, items),

    listEvaluations: () => readJson(files.evaluations, []),
    saveEvaluations: (items) => writeJson(files.evaluations, items),

    listAcquisitions: () => readJson(files.acquisitions, []),
    saveAcquisitions: (items) => writeJson(files.acquisitions, items),

    listInventory: () => readJson(files.inventory, []),
    saveInventory: (items) => writeJson(files.inventory, items),

    listCatalog: () => readJson(files.catalog, []),
    saveCatalog: (items) => writeJson(files.catalog, items),

    listSales: () => readJson(files.sales, []),
    saveSales: (items) => writeJson(files.sales, items),

    listExports: () => readJson(files.exports, []),
    saveExports: (items) => writeJson(files.exports, items),

    listCv: () => readJson(files.cv, []),
    saveCv: (items) => writeJson(files.cv, items),
    cvDocsDir,

    listAgenda: () => readJson(files.agenda, []),
    saveAgenda: (items) => writeJson(files.agenda, items),
    listNotices: () => readJson(files.notices, []),
    saveNotices: (items) => writeJson(files.notices, items),

    listPayments: () => readJson(files.payments, []),
    savePayments: (items) => writeJson(files.payments, items),
  }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

export function newInviteToken() {
  return crypto.randomBytes(32).toString('base64url')
}
