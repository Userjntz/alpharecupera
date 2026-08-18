const CHUNK = 900_000

type D1Like = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
      first<T = Record<string, unknown>>(): Promise<T | null>
      run(): Promise<unknown>
    }
    run(): Promise<unknown>
  }
  batch?(statements: unknown[]): Promise<unknown>
}

type KvFallback = {
  get(
    key: string,
    type?: string,
  ): Promise<string | ArrayBuffer | null>
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>
  delete?(key: string): Promise<void>
  getWithMetadata?(
    key: string,
    type?: string,
  ): Promise<{ value: ArrayBuffer | string | null; metadata: unknown }>
}

type MetaRow = {
  key: string
  value: string | null
  meta: string | null
  kind: string
  expires_at: number | null
}

function nowIso() {
  return new Date().toISOString()
}

function asBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value)
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

function isExpired(expiresAt: number | null | undefined) {
  if (!expiresAt) return false
  return expiresAt <= Math.floor(Date.now() / 1000)
}

let schemaReady = false

async function ensureSchema(db: D1Like) {
  if (schemaReady) return
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_kv (
        key TEXT PRIMARY KEY,
        value TEXT,
        meta TEXT,
        kind TEXT NOT NULL DEFAULT 'text',
        expires_at INTEGER,
        updated_at TEXT NOT NULL
      )`,
    )
    .run()
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_kv_chunks (
        key TEXT NOT NULL,
        idx INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (key, idx)
      )`,
    )
    .run()
  schemaReady = true
}

async function readChunks(db: D1Like, key: string): Promise<Uint8Array> {
  const { results } = await db
    .prepare(
      'SELECT idx, data FROM app_kv_chunks WHERE key = ? ORDER BY idx ASC',
    )
    .bind(key)
    .all<{ idx: number; data: ArrayBuffer | Uint8Array }>()
  const parts = (results || []).map((row) =>
    row.data instanceof Uint8Array ? row.data : new Uint8Array(row.data),
  )
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

async function writeChunks(db: D1Like, key: string, bytes: Uint8Array) {
  await db.prepare('DELETE FROM app_kv_chunks WHERE key = ?').bind(key).run()
  for (let i = 0, idx = 0; i < bytes.byteLength; i += CHUNK, idx += 1) {
    const slice = bytes.slice(i, i + CHUNK)
    await db
      .prepare('INSERT INTO app_kv_chunks (key, idx, data) VALUES (?, ?, ?)')
      .bind(key, idx, slice)
      .run()
  }
}

export function wrapDurableKv(db: D1Like | undefined, kv: KvFallback) {
  if (!db) return kv

  async function getRow(key: string): Promise<MetaRow | null> {
    await ensureSchema(db)
    const row = await db
      .prepare(
        'SELECT key, value, meta, kind, expires_at FROM app_kv WHERE key = ?',
      )
      .bind(key)
      .first<MetaRow>()
    if (!row) return null
    if (isExpired(row.expires_at)) {
      await del(key)
      return null
    }
    return row
  }

  async function del(key: string) {
    await ensureSchema(db)
    await db.prepare('DELETE FROM app_kv_chunks WHERE key = ?').bind(key).run()
    await db.prepare('DELETE FROM app_kv WHERE key = ?').bind(key).run()
    try {
      await kv.delete?.(key)
    } catch {
      /* KV pode estar no limite; o D1 já apagou */
    }
  }

  async function put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: { expirationTtl?: number; metadata?: unknown },
  ) {
    await ensureSchema(db)
    const binary = typeof value !== 'string'
    const bytes = asBytes(value)
    const chunked = binary || bytes.byteLength > CHUNK
    const expiresAt = options?.expirationTtl
      ? Math.floor(Date.now() / 1000) + options.expirationTtl
      : null
    const meta = options?.metadata ? JSON.stringify(options.metadata) : null
    const textValue = chunked
      ? null
      : typeof value === 'string'
        ? value
        : new TextDecoder().decode(bytes)
    await db
      .prepare(
        `INSERT OR REPLACE INTO app_kv (key, value, meta, kind, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        key,
        textValue,
        meta,
        binary ? 'blob' : 'text',
        expiresAt,
        nowIso(),
      )
      .run()
    if (chunked) await writeChunks(db, key, bytes)
    else await db.prepare('DELETE FROM app_kv_chunks WHERE key = ?').bind(key).run()
  }

  async function fromFallback(key: string, type?: string) {
    if (type === 'arrayBuffer') {
      const withMeta = kv.getWithMetadata
        ? await kv.getWithMetadata(key, 'arrayBuffer')
        : { value: await kv.get(key, 'arrayBuffer'), metadata: null }
      if (!withMeta?.value) return { value: null, metadata: null }
      const buf = withMeta.value as ArrayBuffer
      try {
        await put(key, buf, {
          metadata: withMeta.metadata || undefined,
        })
      } catch {
        /* leitura ainda funciona mesmo se o backfill falhar */
      }
      return { value: buf, metadata: withMeta.metadata }
    }
    const text = (await kv.get(key)) as string | null
    if (text == null) return { value: null, metadata: null }
    try {
      await put(key, text)
    } catch {
      /* ignore */
    }
    return { value: text, metadata: null }
  }

  async function readValue(key: string, type?: string) {
    const row = await getRow(key)
    if (!row) return fromFallback(key, type)
    let bytes: Uint8Array | null = null
    if (row.value == null || row.kind === 'blob') {
      bytes = await readChunks(db, key)
      if (!bytes.byteLength && row.value) {
        bytes = new TextEncoder().encode(row.value)
      }
    }
    const metadata = row.meta
      ? (JSON.parse(row.meta) as unknown)
      : null
    if (type === 'arrayBuffer') {
      if (bytes) {
        const copy = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        )
        return { value: copy, metadata }
      }
      return {
        value: new TextEncoder().encode(row.value || '').buffer,
        metadata,
      }
    }
    if (bytes) {
      return { value: new TextDecoder().decode(bytes), metadata }
    }
    return { value: row.value, metadata }
  }

  return {
    async get(key: string, type?: string) {
      const out = await readValue(key, type)
      return out.value
    },
    put,
    delete: del,
    async getWithMetadata(key: string, type?: string) {
      return readValue(key, type || 'arrayBuffer')
    },
  }
}
