const API_URL =
  (import.meta.env.VITE_LEADS_API_URL as string | undefined) ||
  (import.meta.env.PROD
    ? 'https://alpha-recupera-api.alpharecupera.workers.dev'
    : 'http://localhost:8787')

const MAX_PHOTOS = 5
const MAX_BYTES = 4 * 1024 * 1024

export { MAX_PHOTOS }

/** Redimensiona/comprim e JPEG para caber no upload. */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Envie apenas imagens (JPG ou PNG)')
  }
  if (file.size <= 900_000 && (file.type === 'image/jpeg' || file.type === 'image/jpg')) {
    return file
  }

  const bitmap = await createImageBitmap(file)
  const maxSide = 1600
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82),
  )
  if (!blob) throw new Error('Falha ao comprimir a foto')
  if (blob.size > MAX_BYTES) {
    throw new Error('Foto muito grande. Tente outra com menos resolução.')
  }
  return blob
}

export async function uploadLeadPhoto(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ id: string; url: string }> {
  onProgress?.(10)
  const blob = await compressImage(file)
  onProgress?.(40)
  const body = new FormData()
  body.append(
    'file',
    blob,
    file.name.replace(/\.\w+$/, '') + '.jpg',
  )
  const res = await fetch(`${API_URL}/leads/photos?_=${Date.now()}`, {
    method: 'POST',
    body,
  })
  onProgress?.(90)
  if (!res.ok) {
    let message = `Falha no upload (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const data = (await res.json()) as {
    ok?: boolean
    photo?: { id: string; url: string }
  }
  if (!data.photo?.url) throw new Error('Upload sem URL')
  onProgress?.(100)
  return { id: data.photo.id, url: data.photo.url }
}
