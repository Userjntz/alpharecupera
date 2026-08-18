import type { LeadRecord } from '@shared/leads'
import { resolveLeadUf } from './ddd'

export type RankItem = { label: string; value: number; pct: number }

export function rankBy(
  leads: LeadRecord[],
  keyFn: (lead: LeadRecord) => string | null | undefined,
  limit = 6,
): RankItem[] {
  const counts = new Map<string, number>()
  for (const lead of leads) {
    const key = (keyFn(lead) || '—').trim() || '—'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const total = leads.length || 1
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value,
      pct: Math.round((value / total) * 1000) / 10,
    }))
}

export function countByUf(leads: LeadRecord[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const lead of leads) {
    const uf = resolveLeadUf(lead)
    if (!uf) continue
    counts[uf] = (counts[uf] || 0) + 1
  }
  return counts
}

export function uniqueCities(leads: LeadRecord[]) {
  return new Set(
    leads
      .map((l) => l.cidade?.trim().toLowerCase())
      .filter(Boolean),
  ).size
}

export function uniqueStates(leads: LeadRecord[]) {
  return new Set(
    leads.map((l) => resolveLeadUf(l)).filter(Boolean),
  ).size
}

export function todayCount(leads: LeadRecord[]) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return leads.filter((l) => new Date(l.created_at) >= start).length
}

export function avgScore(leads: LeadRecord[]) {
  if (!leads.length) return 0
  const sum = leads.reduce((acc, l) => acc + (Number(l.score) || 0), 0)
  return Math.round(sum / leads.length)
}
