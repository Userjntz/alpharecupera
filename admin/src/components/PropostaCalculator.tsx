import { useMemo } from 'react'
import { Calculator } from 'lucide-react'
import type { LeadRecord } from '@shared/leads'
import {
  calcProposta,
  extractPropostaInput,
  formatBRL,
  propostaAnnotationBody,
} from '@shared/proposta'

type DraftLike = {
  valor_fipe?: string
  valor_parcela: string
  quantas_vezes: string
  parcelas_pagas: string
  parcelas_atrasadas: string
  valor_debito: string
  quilometragem?: string
  marca?: string
  modelo?: string
}

export function PropostaCalculator({
  lead,
  draft,
  onApplyFechado,
  onSaveNote,
  busy,
}: {
  lead: LeadRecord
  draft: DraftLike
  onApplyFechado: (valor: string) => void
  onSaveNote: (body: string) => void
  busy?: boolean
}) {
  const result = useMemo(
    () => calcProposta(extractPropostaInput(lead, draft)),
    [lead, draft],
  )

  const ready = result.missing.length === 0

  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-line flex items-center gap-2">
        <Calculator className="w-4 h-4 text-brand" />
        <div>
          <p className="text-sm font-extrabold">Calculadora de proposta</p>
          <p className="text-[11px] text-muted font-medium">
            Parcela, pagas e atraso definem o valor · débitos só na comparação com a FIPE · pagar 10–20%
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {!ready ? (
          <p className="text-sm font-semibold text-muted">
            Preencha na ficha ou nas anotações: {result.missing.join(', ')}.
          </p>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Kpi label="FIPE" value={formatBRL(result.fipe)} />
          <Kpi label="Parcela" value={formatBRL(result.valorParcela)} />
          <Kpi
            label="Total do contrato"
            value={formatBRL(result.totalContrato)}
            hint={`${result.quantasVezes} vezes`}
          />
          <Kpi
            label="Já pago"
            value={formatBRL(result.valorPago)}
            hint={`${result.parcelasPagas} parcelas`}
          />
          <Kpi
            label="Em atraso"
            value={formatBRL(result.valorAtraso)}
            hint={`${result.parcelasAtrasadas} parcelas`}
          />
          <Kpi
            label="Saldo no banco"
            value={formatBRL(result.saldoBanco)}
            hint={`${result.parcelasRestantes} restantes`}
          />
          <Kpi label="Débitos" value={formatBRL(result.debitos)} />
          <Kpi
            label="Obrigação"
            value={formatBRL(result.obrigacao)}
            hint="saldo + débitos"
            warn={result.acimaFipe}
          />
          <Kpi
            label="Vs FIPE"
            value={
              result.fipe
                ? `${result.acimaFipe ? '+' : '−'} ${formatBRL(Math.abs(result.vsFipe))}`
                : '—'
            }
            hint={result.acimaFipe ? 'acima da tabela' : 'abaixo da tabela'}
            warn={result.acimaFipe}
          />
        </div>

        <div className="rounded-xl bg-[#fff8ef] border border-line px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            Pagar ao cliente
          </p>
          <p className="text-2xl font-extrabold text-brand-grad mt-0.5">
            {formatBRL(result.pagarSugerido)}
          </p>
          <p className="text-xs font-semibold text-muted mt-1">
            {result.percentualSugerido}% da FIPE · faixa{' '}
            {formatBRL(result.pagarMin)} a {formatBRL(result.pagarMax)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => onApplyFechado(formatBRL(result.pagarSugerido))}
            className="inline-flex items-center rounded-xl btn-brand px-3.5 py-2 text-xs disabled:opacity-50"
          >
            Usar no valor fechado
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => onSaveNote(propostaAnnotationBody(result))}
            className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-xs font-bold hover:bg-soft disabled:opacity-50"
          >
            Salvar na anotação
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5 bg-[#fafafa]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`text-sm font-extrabold mt-0.5 ${warn ? 'text-bad' : ''}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-[10px] font-semibold text-muted mt-0.5">{hint}</p>
      ) : null}
    </div>
  )
}
