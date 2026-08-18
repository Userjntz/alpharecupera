import { putIfChanged } from '../lib/kvWrite'

const KEYS = {
  teams: 'admin:teams',
  invites: 'admin:invites',
  audit: 'admin:audit',
  sessions: 'admin:sessions',
  settings: 'admin:settings',
  notifications: 'admin:notifications',
  vehicles: 'admin:vehicles',
  evaluations: 'admin:evaluations',
  acquisitions: 'admin:acquisitions',
  inventory: 'admin:inventory',
  catalog: 'admin:catalog',
  sales: 'admin:sales',
  exports: 'admin:exports',
  cv: 'admin:cv',
  agenda: 'admin:agenda',
  notices: 'admin:notices',
  payments: 'admin:payments',
} as const

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
  updated_at: null as string | null,
  version: 1,
}

async function readList<T>(kv: KVNamespace, key: string): Promise<T[]> {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as T[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function writeList<T>(
  kv: KVNamespace,
  key: string,
  data: T[],
  bestEffort = false,
) {
  await putIfChanged(kv, key, JSON.stringify(data), { bestEffort })
}

export type AdminKvStore = ReturnType<typeof createAdminKvStore>

export function createAdminKvStore(kv: KVNamespace) {
  return {
    async listTeams() {
      const teams = await readList<Record<string, unknown>>(kv, KEYS.teams)
      if (teams.length) return teams
      const now = new Date().toISOString()
      const seeded = [
        'Atendimento',
        'Compras / Aquisição',
        'Avaliação',
        'Vendas',
        'Marketing',
        'Financeiro',
        'Administração',
      ].map((name) => ({
        id: crypto.randomUUID(),
        key: name.toLowerCase().replace(/\s+/g, '_').slice(0, 40),
        name,
        leaderId: null,
        memberIds: [] as string[],
        archived: false,
        created_at: now,
        updated_at: now,
      }))
      await writeList(kv, KEYS.teams, seeded, true)
      return seeded
    },
    saveTeams: (teams: unknown[]) => writeList(kv, KEYS.teams, teams),
    listInvites: () => readList(kv, KEYS.invites),
    saveInvites: (items: unknown[]) => writeList(kv, KEYS.invites, items),
    listAudit: () => readList(kv, KEYS.audit),
    async appendAudit(entry: unknown) {
      const all = await readList(kv, KEYS.audit)
      all.unshift(entry)
      await writeList(kv, KEYS.audit, all.slice(0, 5000), true)
    },
    listSessions: () => readList(kv, KEYS.sessions),
    saveSessions: (items: unknown[]) =>
      writeList(kv, KEYS.sessions, items, true),
    async getSettings() {
      const raw = await kv.get(KEYS.settings)
      if (!raw) return { ...DEFAULT_SETTINGS }
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },
    saveSettings: (settings: unknown) =>
      putIfChanged(kv, KEYS.settings, JSON.stringify(settings)),
    listNotifications: () => readList(kv, KEYS.notifications),
    saveNotifications: (items: unknown[]) =>
      writeList(kv, KEYS.notifications, items),
    listVehicles: () => readList(kv, KEYS.vehicles),
    saveVehicles: (items: unknown[]) => writeList(kv, KEYS.vehicles, items),
    listEvaluations: () => readList(kv, KEYS.evaluations),
    saveEvaluations: (items: unknown[]) =>
      writeList(kv, KEYS.evaluations, items),
    listAcquisitions: () => readList(kv, KEYS.acquisitions),
    saveAcquisitions: (items: unknown[]) =>
      writeList(kv, KEYS.acquisitions, items),
    listInventory: () => readList(kv, KEYS.inventory),
    saveInventory: (items: unknown[]) => writeList(kv, KEYS.inventory, items),
    listCatalog: () => readList(kv, KEYS.catalog),
    saveCatalog: (items: unknown[]) => writeList(kv, KEYS.catalog, items),
    listSales: () => readList(kv, KEYS.sales),
    saveSales: (items: unknown[]) => writeList(kv, KEYS.sales, items),
    listExports: () => readList(kv, KEYS.exports),
    saveExports: (items: unknown[]) => writeList(kv, KEYS.exports, items),
    listCv: () => readList(kv, KEYS.cv),
    saveCv: (items: unknown[]) => writeList(kv, KEYS.cv, items),
    listAgenda: () => readList(kv, KEYS.agenda),
    saveAgenda: (items: unknown[]) => writeList(kv, KEYS.agenda, items),
    listNotices: () => readList(kv, KEYS.notices),
    saveNotices: (items: unknown[]) => writeList(kv, KEYS.notices, items),
    listPayments: () => readList(kv, KEYS.payments),
    savePayments: (items: unknown[]) => writeList(kv, KEYS.payments, items),
  }
}

export async function sha256Base64Url(input: string) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function newInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
