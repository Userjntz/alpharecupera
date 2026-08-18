export function isKvQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /put\(\)\s*limit exceeded|KV put.*limit|exceeded for the day/i.test(
    message,
  )
}

type KvPut = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

/** Só grava se o valor mudou. Evita queimar a cota diária de KV writes. */
export async function putIfChanged(
  kv: KvPut,
  key: string,
  value: string,
  options?: { expirationTtl?: number; bestEffort?: boolean },
) {
  const prev = await kv.get(key)
  if (prev === value) return false
  const putOptions = options?.expirationTtl
    ? { expirationTtl: options.expirationTtl }
    : undefined
  try {
    await kv.put(key, value, putOptions)
    return true
  } catch (error) {
    if (options?.bestEffort) {
      console.warn('KV put skipped:', key, error)
      return false
    }
    throw error
  }
}
