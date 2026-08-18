/** DDD → UF (principal) */
const DDD_TO_UF: Record<string, string> = {
  '11': 'SP',
  '12': 'SP',
  '13': 'SP',
  '14': 'SP',
  '15': 'SP',
  '16': 'SP',
  '17': 'SP',
  '18': 'SP',
  '19': 'SP',
  '21': 'RJ',
  '22': 'RJ',
  '24': 'RJ',
  '27': 'ES',
  '28': 'ES',
  '31': 'MG',
  '32': 'MG',
  '33': 'MG',
  '34': 'MG',
  '35': 'MG',
  '37': 'MG',
  '38': 'MG',
  '41': 'PR',
  '42': 'PR',
  '43': 'PR',
  '44': 'PR',
  '45': 'PR',
  '46': 'PR',
  '47': 'SC',
  '48': 'SC',
  '49': 'SC',
  '51': 'RS',
  '53': 'RS',
  '54': 'RS',
  '55': 'RS',
  '61': 'DF',
  '62': 'GO',
  '63': 'TO',
  '64': 'GO',
  '65': 'MT',
  '66': 'MT',
  '67': 'MS',
  '68': 'AC',
  '69': 'RO',
  '71': 'BA',
  '73': 'BA',
  '74': 'BA',
  '75': 'BA',
  '77': 'BA',
  '79': 'SE',
  '81': 'PE',
  '82': 'AL',
  '83': 'PB',
  '84': 'RN',
  '85': 'CE',
  '86': 'PI',
  '87': 'PE',
  '88': 'CE',
  '89': 'PI',
  '91': 'PA',
  '92': 'AM',
  '93': 'PA',
  '94': 'PA',
  '95': 'RR',
  '96': 'AP',
  '97': 'AM',
  '98': 'MA',
  '99': 'MA',
}

const UF_SET = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
])

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}

export function normalizeUf(raw: string): string | null {
  const v = raw.trim().toUpperCase()
  if (UF_SET.has(v)) return v
  const byName = Object.entries(UF_NAMES).find(
    ([, name]) => name.toUpperCase() === v,
  )
  return byName?.[0] ?? null
}

export function dddFromPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length < 10) return null
  return local.slice(0, 2)
}

/** Estado do lead: campo informado, senão DDD do WhatsApp */
export function resolveLeadUf(lead: {
  estado?: string
  telefone?: string
}): string | null {
  const fromField = lead.estado ? normalizeUf(lead.estado) : null
  if (fromField) return fromField
  const ddd = lead.telefone ? dddFromPhone(lead.telefone) : null
  if (!ddd) return null
  return DDD_TO_UF[ddd] ?? null
}
