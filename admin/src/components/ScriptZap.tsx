import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Lightbulb,
  MessageCircle,
  Sparkles,
} from 'lucide-react'

type ScriptStep = {
  id: string
  n: number
  title: string
  goal: string
  message: string
  tip?: string
}

const OPENING: ScriptStep = {
  id: 'abertura',
  n: 0,
  title: 'Abertura',
  goal: 'Quebrar o gelo e puxar o assunto com leveza',
  message:
    'Oi, [NOME]! Tudo bem?\nAqui é da Alpha Recupera 😊\nVi seu interesse em vender o carro e quero te ajudar do jeito mais rápido possível.\nPode me responder rapidinho umas perguntinhas?',
  tip: 'Troque [NOME] pelo primeiro nome. Se já veio do quiz, cite o carro se souber.',
}

const STEPS: ScriptStep[] = [
  {
    id: 'modelo',
    n: 1,
    title: 'Modelo do veículo',
    goal: 'Saber o que estamos avaliando',
    message:
      'Perfeito! Me conta: qual o modelo do seu carro?\n(Ex.: Gol 1.0, Onix LT, Civic EX…)',
    tip: 'Se já veio no lead, confirme: “É o [modelo], certo?”',
  },
  {
    id: 'ano',
    n: 2,
    title: 'Ano',
    goal: 'Cruzar com a FIPE e o mercado',
    message: 'E qual o ano dele?',
  },
  {
    id: 'fipe',
    n: 3,
    title: 'Tabela FIPE',
    goal: 'Entender se a pessoa já tem referência de valor',
    message:
      'Você sabe mais ou menos a tabela FIPE do seu carro?\nSe não souber, sem problema — a gente te ajuda nisso.',
    tip: 'Se disser que sabe, peça o valor. Se não, use o Puxador FIPE no painel.',
  },
  {
    id: 'km',
    n: 4,
    title: 'Quilometragem',
    goal: 'Avaliar uso e condição',
    message: 'Quantos km ele tem hoje, mais ou menos?',
  },
  {
    id: 'banco-entrada',
    n: 5,
    title: 'Banco e entrada',
    goal: 'Mapear o financiamento',
    message:
      'Ele está financiado em qual banco?\nE quanto você deu de entrada na época?',
    tip: 'Pode vir em duas mensagens se a pessoa travar.',
  },
  {
    id: 'parcelas',
    n: 6,
    title: 'Valor das parcelas',
    goal: 'Entender o compromisso mensal',
    message: 'Hoje, qual o valor da parcela?',
  },
  {
    id: 'atraso-pagas',
    n: 7,
    title: 'Pagas e atrasadas',
    goal: 'Ver urgência e risco com o banco',
    message:
      'Me ajuda com dois números:\n• quantas parcelas já estão pagas?\n• e quantas estão atrasadas (se tiver)?',
    tip: 'Se estiver sem atraso, celebre e siga: “Ótimo, facilita bastante.”',
  },
  {
    id: 'debito',
    n: 8,
    title: 'Débito total',
    goal: 'Fechar o quadro financeiro',
    message:
      'Pra gente fechar a conta: quanto está o débito total com o banco hoje?\n(Se tiver o extrato ou print, pode mandar.)',
    tip: 'Depois disso, resuma o que entendeu e diga o próximo passo (análise / proposta).',
  },
]

const CLOSING: ScriptStep = {
  id: 'fechamento',
  n: 9,
  title: 'Fechamento',
  goal: 'Dar segurança e próximo passo',
  message:
    'Perfeito, [NOME]! Já entendi o cenário.\nVou analisar aqui com calma e já te retorno com a melhor condição pra você.\nQualquer dúvida, pode me chamar por aqui 👍',
}

function CopyBtn({
  text,
  label = 'Copiar',
}: {
  text: string
  label?: string
}) {
  const [ok, setOk] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setOk(true)
          window.setTimeout(() => setOk(false), 1400)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-soft transition-colors shrink-0"
    >
      {ok ? (
        <Check className="w-3.5 h-3.5 text-ok" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted" />
      )}
      {ok ? 'Copiado' : label}
    </button>
  )
}

function Bubble({ step }: { step: ScriptStep }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-lg bg-soft text-brand text-xs font-extrabold">
              {step.n === 0 ? 'Oi' : step.n === 9 ? '✓' : step.n}
            </span>
            <h3 className="text-sm font-extrabold tracking-tight">
              {step.title}
            </h3>
          </div>
          <p className="text-xs text-muted font-medium mt-1">{step.goal}</p>
        </div>
        <CopyBtn text={step.message} />
      </div>

      <div className="rounded-2xl rounded-tl-md bg-[#e7f8ee] border border-[#cfeedd] px-4 py-3">
        <p className="text-[13px] sm:text-sm font-medium whitespace-pre-wrap leading-relaxed text-[#14532d]">
          {step.message}
        </p>
      </div>

      {step.tip && (
        <p className="text-xs text-muted font-medium flex items-start gap-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
          <span>{step.tip}</span>
        </p>
      )}
    </article>
  )
}

export function ScriptZap() {
  const fullScript = useMemo(() => {
    const parts = [OPENING, ...STEPS, CLOSING].map((s) => {
      const head =
        s.n === 0
          ? 'ABERTURA'
          : s.n === 9
            ? 'FECHAMENTO'
            : `${s.n}. ${s.title.toUpperCase()}`
      return `${head}\n${s.message}`
    })
    return parts.join('\n\n——————\n\n')
  }, [])

  return (
    <div className="max-w-3xl space-y-5">
      <section className="rounded-3xl bg-white border border-line p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-soft text-brand flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight">
                Script Zap
              </h2>
              <p className="text-sm text-muted font-medium mt-0.5">
                Roteiro humano pra atendimento no WhatsApp. Copie, personalize e
                fale como pessoa — não como robô.
              </p>
            </div>
          </div>
          <CopyBtn text={fullScript} label="Copiar tudo" />
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Hint
            title="Uma pergunta por vez"
            text="Espere a resposta antes de mandar a próxima."
          />
          <Hint
            title="Use o nome"
            text="Troque [NOME] e adapte se o lead já veio do quiz."
          />
          <Hint
            title="Não force"
            text="Se a pessoa travar, ofereça ajuda (“posso te explicar”)."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Sparkles className="w-4 h-4 text-brand" />
          <p className="text-sm font-bold">Fluxo sugerido</p>
        </div>
        <Bubble step={OPENING} />
        {STEPS.map((step) => (
          <Bubble key={step.id} step={step} />
        ))}
        <Bubble step={CLOSING} />
      </section>
    </div>
  )
}

function Hint({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-[#fffaf3] border border-line px-3.5 py-3">
      <p className="text-xs font-extrabold">{title}</p>
      <p className="text-xs text-muted font-medium mt-0.5 leading-relaxed">
        {text}
      </p>
    </div>
  )
}
