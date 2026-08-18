export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length !== 11) return phone
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
}

export function formatKm(km: string) {
  const n = Number(km.replace(/\D/g, ''))
  if (!n) return km || '—'
  return `${n.toLocaleString('pt-BR')} km`
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}
