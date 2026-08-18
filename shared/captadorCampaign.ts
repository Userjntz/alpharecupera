/** Slug padrão: quiz sem parâmetro continua indo para o João. */
export const DEFAULT_CAPTADOR_SLUG = 'joao'

export const QUIZ_PUBLIC_URL = 'https://alpharecupera.com.br'

export type CaptadorUserLike = {
  id: string
  name?: string
  slug?: string | null
  role?: string
  status?: string
  active?: boolean
}

export type CaptadorLeadLike = {
  assigneeId?: string | null
  assigneeName?: string | null
  captadorSlug?: string | null
  origem?: string | null
  createdById?: string | null
}

export function slugifyCaptador(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Primeiro nome vira o código da campanha: "João Silva" → "joao". */
export function slugFromUserName(name: string): string {
  const first = String(name || '')
    .trim()
    .split(/\s+/)[0] || ''
  return slugifyCaptador(first)
}

export function effectiveUserSlug(user: CaptadorUserLike): string {
  return slugifyCaptador(user.slug || '') || slugFromUserName(user.name || '')
}

export function parseCaptadorSlugFromSearch(search: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  return slugifyCaptador(
    params.get('c') || params.get('captador') || params.get('ref') || '',
  )
}

export function campaignQuizUrl(
  slug: string,
  origin = QUIZ_PUBLIC_URL,
): string {
  const s = slugifyCaptador(slug)
  const base = origin.replace(/\/$/, '')
  if (!s || s === DEFAULT_CAPTADOR_SLUG) return base
  return `${base}/?c=${encodeURIComponent(s)}`
}

function isActiveUser(user: CaptadorUserLike) {
  const status =
    user.status || (user.active === false ? 'SUSPENDED' : 'ACTIVE')
  return status === 'ACTIVE'
}

export function uniqueCaptadorSlug(
  desired: string,
  users: CaptadorUserLike[],
  exceptId?: string,
): string {
  const base = slugifyCaptador(desired) || 'captador'
  let slug = base
  let n = 2
  const taken = (value: string) =>
    users.some(
      (u) =>
        u.id !== exceptId &&
        isActiveUser(u) &&
        effectiveUserSlug(u) === value,
    )
  while (taken(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}

export function matchCaptadorBySlug<T extends CaptadorUserLike>(
  users: T[],
  requestedSlug: string,
): T | null {
  const requested = slugifyCaptador(requestedSlug)
  if (!requested) return null
  const active = users.filter(isActiveUser)
  const exact = active.find((u) => effectiveUserSlug(u) === requested)
  if (exact) return exact
  return (
    active.find((u) => slugFromUserName(u.name || '') === requested) || null
  )
}

export function resolveCaptadorAssignee<T extends CaptadorUserLike>(
  users: T[],
  requestedSlug: string,
): { slug: string; user: T | null } {
  const requested = slugifyCaptador(requestedSlug)
  const matched = matchCaptadorBySlug(
    users,
    requested || DEFAULT_CAPTADOR_SLUG,
  )
  if (requested && matched) return { slug: requested, user: matched }
  const fallback = matchCaptadorBySlug(users, DEFAULT_CAPTADOR_SLUG)
  return {
    slug: DEFAULT_CAPTADOR_SLUG,
    user: fallback,
  }
}

export function leadVisibleToCaptador(
  lead: CaptadorLeadLike,
  user: CaptadorUserLike,
): boolean {
  const slug = effectiveUserSlug(user)
  const origem = String(lead.origem || 'quiz')

  if (origem === 'manual') {
    if (lead.createdById && lead.createdById === user.id) return true
    if (lead.assigneeId && lead.assigneeId === user.id) return true
    if (lead.captadorSlug && lead.captadorSlug === slug) return true
    return false
  }

  if (lead.captadorSlug) return lead.captadorSlug === slug
  if (lead.assigneeId) return lead.assigneeId === user.id
  return slug === DEFAULT_CAPTADOR_SLUG
}

/** Garante slug persistido (joao, enzo…) sem colidir. Ativos têm prioridade. */
export function withPersistedCaptadorSlugs<T extends CaptadorUserLike>(
  users: T[],
): { users: T[]; changed: boolean } {
  const assigned = new Map<string, string>()
  const take = (u: T) => {
    if (assigned.has(u.id)) return
    const existing = slugifyCaptador(u.slug || '')
    const used = new Set(assigned.values())
    if (existing && !used.has(existing)) {
      assigned.set(u.id, existing)
      return
    }
    const desired = existing || effectiveUserSlug(u) || 'captador'
    let slug = desired
    let n = 2
    while (used.has(slug)) {
      slug = `${desired}-${n}`
      n += 1
    }
    assigned.set(u.id, slug)
  }
  for (const u of users) {
    if (isActiveUser(u)) take(u)
  }
  for (const u of users) take(u)

  let changed = false
  const next = users.map((u) => {
    const slug = assigned.get(u.id) || effectiveUserSlug(u)
    if (u.slug === slug) return u
    changed = true
    return { ...u, slug }
  })
  return { users: next, changed }
}

type RepairableLead = CaptadorLeadLike & Record<string, unknown>

/** Link normal → João; ?c=slug → captador da campanha. Manuais não mexem. */
export function reassignQuizCampaignLeads<T extends RepairableLead>(
  leads: T[],
  users: CaptadorUserLike[],
): { leads: T[]; changed: boolean } {
  const joao = matchCaptadorBySlug(users, DEFAULT_CAPTADOR_SLUG)
  let changed = false
  const next = leads.map((lead) => {
    if (String(lead.origem || '') === 'manual') return lead
    const requested = slugifyCaptador(String(lead.captadorSlug || ''))
    const matched = requested
      ? matchCaptadorBySlug(users, requested)
      : null
    const owner = matched || joao
    const slug = matched ? requested : DEFAULT_CAPTADOR_SLUG
    if (!owner) return lead
    if (
      lead.assigneeId === owner.id &&
      lead.captadorSlug === slug &&
      lead.assigneeName === owner.name
    ) {
      return lead
    }
    changed = true
    return {
      ...lead,
      captadorSlug: slug,
      assigneeId: owner.id,
      assigneeName: owner.name,
    }
  })
  return { leads: next, changed }
}
