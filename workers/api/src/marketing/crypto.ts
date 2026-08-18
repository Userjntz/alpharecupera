/** Criptografia AES-GCM para tokens OAuth em repouso. */

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(secret: string) {
  const raw = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(
  plaintext: string,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY não configurada')
  const key = await importKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return `${b64url(iv)}.${b64url(cipher)}`
}

export async function decryptSecret(
  payload: string,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY não configurada')
  const [ivPart, dataPart] = payload.split('.')
  if (!ivPart || !dataPart) throw new Error('Token criptografado inválido')
  const key = await importKey(secret)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(ivPart) },
    key,
    fromB64url(dataPart),
  )
  return new TextDecoder().decode(plain)
}

export function maskToken(token: string): string {
  if (!token || token.length < 8) return '***'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}
