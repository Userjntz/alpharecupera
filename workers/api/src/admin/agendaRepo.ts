import type { AgendaEvent, PanelNotice } from '../../../../shared/agenda'

export type AgendaDb = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
      first<T = Record<string, unknown>>(): Promise<T | null>
      run(): Promise<unknown>
    }
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
    first<T = Record<string, unknown>>(): Promise<T | null>
    run(): Promise<unknown>
  }
  batch?<T>(
    statements: { bind(...values: unknown[]): unknown }[],
  ): Promise<T[]>
}

type KvLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

type EventRow = {
  id: string
  title: string
  description: string
  type: string
  color: string
  date: string
  start_time: string
  end_time: string
  all_day: number
  location: string
  lead_id: string | null
  lead_name: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
}

type NoticeRow = {
  id: string
  title: string
  body: string
  level: string
  active: number
  pinned: number
  expires_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
}

function asEvent(row: EventRow): AgendaEvent {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    type: (row.type as AgendaEvent['type']) || 'reuniao',
    color: (row.color as AgendaEvent['color']) || 'brand',
    date: row.date,
    start_time: row.start_time || '',
    end_time: row.end_time || '',
    all_day: Boolean(row.all_day),
    location: row.location || '',
    lead_id: row.lead_id || undefined,
    lead_name: row.lead_name || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by || undefined,
    created_by_name: row.created_by_name || undefined,
  }
}

function asNotice(row: NoticeRow): PanelNotice {
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    level: (row.level as PanelNotice['level']) || 'info',
    active: Boolean(row.active),
    pinned: Boolean(row.pinned),
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by || undefined,
    created_by_name: row.created_by_name || undefined,
  }
}

async function readJsonList<T>(kv: KvLike, key: string): Promise<T[]> {
  const raw = await kv.get(key)
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as T[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export function createAgendaRepo(db: AgendaDb, kv?: KvLike) {
  let migrated = false

  async function ensureMigrated() {
    if (migrated || !kv) return
    const flag = await db
      .prepare('SELECT value FROM app_meta WHERE key = ?')
      .bind('agenda_kv_migrated')
      .first<{ value: string }>()
    if (flag?.value === '1') {
      migrated = true
      return
    }

    const events = await readJsonList<AgendaEvent>(kv, 'admin:agenda')
    const notices = await readJsonList<PanelNotice>(kv, 'admin:notices')
    for (const ev of events) {
      if (!ev?.id) continue
      await db
        .prepare(
          `INSERT OR IGNORE INTO agenda_events (
            id, title, description, type, color, date, start_time, end_time,
            all_day, location, lead_id, lead_name, created_at, updated_at,
            created_by, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ev.id,
          ev.title || 'Sem título',
          ev.description || '',
          ev.type || 'reuniao',
          ev.color || 'brand',
          ev.date,
          ev.start_time || '',
          ev.end_time || '',
          ev.all_day ? 1 : 0,
          ev.location || '',
          ev.lead_id || null,
          ev.lead_name || null,
          ev.created_at,
          ev.updated_at || ev.created_at,
          ev.created_by || null,
          ev.created_by_name || null,
        )
        .run()
    }
    for (const n of notices) {
      if (!n?.id) continue
      await db
        .prepare(
          `INSERT OR IGNORE INTO panel_notices (
            id, title, body, level, active, pinned, expires_at,
            created_at, updated_at, created_by, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          n.id,
          n.title || 'Aviso',
          n.body || '',
          n.level || 'info',
          n.active === false ? 0 : 1,
          n.pinned ? 1 : 0,
          n.expires_at || null,
          n.created_at,
          n.updated_at || n.created_at,
          n.created_by || null,
          n.created_by_name || null,
        )
        .run()
    }
    const now = new Date().toISOString()
    await db
      .prepare(
        'INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)',
      )
      .bind('agenda_kv_migrated', '1', now)
      .run()
    migrated = true
  }

  return {
    async listEvents(from?: string, to?: string) {
      await ensureMigrated()
      let sql =
        'SELECT * FROM agenda_events WHERE 1=1'
      const binds: string[] = []
      if (from) {
        sql += ' AND date >= ?'
        binds.push(from)
      }
      if (to) {
        sql += ' AND date <= ?'
        binds.push(to)
      }
      sql += ' ORDER BY date ASC, start_time ASC'
      const stmt = db.prepare(sql)
      const { results } = binds.length
        ? await stmt.bind(...binds).all<EventRow>()
        : await stmt.all<EventRow>()
      return (results || []).map(asEvent)
    },

    async getEvent(id: string) {
      await ensureMigrated()
      const row = await db
        .prepare('SELECT * FROM agenda_events WHERE id = ?')
        .bind(id)
        .first<EventRow>()
      return row ? asEvent(row) : null
    },

    async insertEvent(ev: AgendaEvent) {
      await ensureMigrated()
      await db
        .prepare(
          `INSERT INTO agenda_events (
            id, title, description, type, color, date, start_time, end_time,
            all_day, location, lead_id, lead_name, created_at, updated_at,
            created_by, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ev.id,
          ev.title,
          ev.description || '',
          ev.type,
          ev.color,
          ev.date,
          ev.start_time || '',
          ev.end_time || '',
          ev.all_day ? 1 : 0,
          ev.location || '',
          ev.lead_id || null,
          ev.lead_name || null,
          ev.created_at,
          ev.updated_at,
          ev.created_by || null,
          ev.created_by_name || null,
        )
        .run()
      return ev
    },

    async updateEvent(id: string, ev: AgendaEvent) {
      await ensureMigrated()
      await db
        .prepare(
          `UPDATE agenda_events SET
            title = ?, description = ?, type = ?, color = ?, date = ?,
            start_time = ?, end_time = ?, all_day = ?, location = ?,
            lead_id = ?, lead_name = ?, updated_at = ?
          WHERE id = ?`,
        )
        .bind(
          ev.title,
          ev.description || '',
          ev.type,
          ev.color,
          ev.date,
          ev.start_time || '',
          ev.end_time || '',
          ev.all_day ? 1 : 0,
          ev.location || '',
          ev.lead_id || null,
          ev.lead_name || null,
          ev.updated_at,
          id,
        )
        .run()
      return this.getEvent(id)
    },

    async deleteEvent(id: string) {
      await ensureMigrated()
      const prev = await this.getEvent(id)
      if (!prev) return false
      await db.prepare('DELETE FROM agenda_events WHERE id = ?').bind(id).run()
      return true
    },

    async listNotices() {
      await ensureMigrated()
      const { results } = await db
        .prepare(
          'SELECT * FROM panel_notices ORDER BY pinned DESC, updated_at DESC',
        )
        .all<NoticeRow>()
      return (results || []).map(asNotice)
    },

    async getNotice(id: string) {
      await ensureMigrated()
      const row = await db
        .prepare('SELECT * FROM panel_notices WHERE id = ?')
        .bind(id)
        .first<NoticeRow>()
      return row ? asNotice(row) : null
    },

    async insertNotice(n: PanelNotice) {
      await ensureMigrated()
      await db
        .prepare(
          `INSERT INTO panel_notices (
            id, title, body, level, active, pinned, expires_at,
            created_at, updated_at, created_by, created_by_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          n.id,
          n.title,
          n.body || '',
          n.level,
          n.active ? 1 : 0,
          n.pinned ? 1 : 0,
          n.expires_at || null,
          n.created_at,
          n.updated_at,
          n.created_by || null,
          n.created_by_name || null,
        )
        .run()
      return n
    },

    async updateNotice(id: string, n: PanelNotice) {
      await ensureMigrated()
      await db
        .prepare(
          `UPDATE panel_notices SET
            title = ?, body = ?, level = ?, active = ?, pinned = ?,
            expires_at = ?, updated_at = ?
          WHERE id = ?`,
        )
        .bind(
          n.title,
          n.body || '',
          n.level,
          n.active ? 1 : 0,
          n.pinned ? 1 : 0,
          n.expires_at || null,
          n.updated_at,
          id,
        )
        .run()
      return this.getNotice(id)
    },

    async deleteNotice(id: string) {
      await ensureMigrated()
      const prev = await this.getNotice(id)
      if (!prev) return false
      await db.prepare('DELETE FROM panel_notices WHERE id = ?').bind(id).run()
      return true
    },
  }
}

export type AgendaRepo = ReturnType<typeof createAgendaRepo>
