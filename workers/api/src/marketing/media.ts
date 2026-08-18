/** Validação de mídia por magic bytes e upload (KV / R2 na Cloudflare). */

export type UploadedFile = {
  bytes: Uint8Array
  filename: string
  mimeDeclared: string
}

export type DetectedMedia = {
  mime: string
  kind: 'image' | 'video'
  ext: string
}

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b)
}

export function detectMedia(bytes: Uint8Array): DetectedMedia | null {
  if (bytes.length < 12) return null
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', kind: 'image', ext: 'jpg' }
  }
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return { mime: 'image/png', kind: 'image', ext: 'png' }
  }
  // MP4 / MOV (ftyp)
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return { mime: 'video/mp4', kind: 'video', ext: 'mp4' }
  }
  return null
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type R2Like = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
}

export async function uploadToR2(
  bucket: R2Like,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  publicBaseUrl: string,
): Promise<{ url: string; pathname: string }> {
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
  })
  const base = publicBaseUrl.replace(/\/$/, '')
  return { url: `${base}/${key}`, pathname: key }
}

export function validateDeclaredMatch(
  declared: string,
  detected: DetectedMedia,
): string[] {
  const errors: string[] = []
  if (declared && declared !== detected.mime) {
    if (
      !(
        (declared === 'video/quicktime' && detected.mime === 'video/mp4') ||
        (declared === 'image/jpg' && detected.mime === 'image/jpeg')
      )
    ) {
      errors.push(
        `MIME declarado (${declared}) não corresponde ao arquivo real (${detected.mime})`,
      )
    }
  }
  return errors
}

export function maxSizeFor(kind: 'image' | 'video') {
  return kind === 'image' ? 8 * 1024 * 1024 : 300 * 1024 * 1024
}
