import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Calendar,
  Camera,
  Car,
  Check,
  Clock,
  DollarSign,
  Gauge,
  ImagePlus,
  Loader2,
  MapPin,
  MessageCircle,
  Shield,
  User,
  Users,
  X,
} from 'lucide-react'
import {
  ANOS,
  BANCOS,
  EMPTY_ANSWERS,
  ESTADOS,
  PARCELAS_ATRASADAS,
  PARCELAS_PAGAS,
  TOTAL_STEPS,
  evaluateLead,
  resultCopy,
  type Answers,
} from './data/quiz'
import {
  displayPhone,
  formatMoneyInput,
  isValidBRMobile,
  onlyDigits,
} from './lib/format'
import { trackQualifiedLead } from './lib/facebook'
import { buildLeadRecord, readQuizCaptadorSlug, saveLead } from './lib/leadsApi'
import { MAX_PHOTOS, uploadLeadPhoto } from './lib/photoUpload'
import { PhoneInput } from './components/PhoneInput'
import { FeedbackCarousel } from './components/FeedbackCarousel'
import {
  BrandMark,
  FieldShell,
  OptionButton,
  PrimaryButton,
  ProgressBar,
  TrustItem,
  fieldClass,
} from './components/ui'
import {
  buildClientWhatsAppMessage,
  buildCompanyWhatsAppUrl,
  buildCompanyWhatsAppUrlAlt,
  formatCompanyWhatsAppDisplay,
  isCompanyWhatsAppReady,
} from './lib/whatsapp'

type Step =
  | 'start'
  | 'contato'
  | 'regiao'
  | 'banco'
  | 'veiculo'
  | 'atrasadas'
  | 'entrada'
  | 'pagas'
  | 'debito'
  | 'final'
  | 'fotos'
  | 'result'

const STEP_NUMBER: Partial<Record<Step, number>> = {
  contato: 1,
  regiao: 2,
  banco: 3,
  veiculo: 4,
  atrasadas: 5,
  entrada: 6,
  pagas: 7,
  debito: 8,
  final: 9,
  fotos: 10,
}

function Screen({
  step,
  title,
  subtitle,
  children,
  last,
}: {
  step: Step
  title: string
  subtitle?: string
  children: ReactNode
  last?: boolean
}) {
  const n = STEP_NUMBER[step] || 1
  return (
    <div className="min-h-screen flex flex-col px-5 py-6">
      <ProgressBar step={n} total={TOTAL_STEPS} last={last} />
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto animate-fade-up">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground text-center mb-3">
          {title}
        </h2>
        {subtitle && (
          <p className="text-muted-foreground text-center text-sm mb-6">{subtitle}</p>
        )}
        {!subtitle && <div className="mb-6" />}
        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [step, setStep] = useState<Step>('start')
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    readQuizCaptadorSlug()
  }, [])
  const [locking, setLocking] = useState(false)
  const [bankModal, setBankModal] = useState(false)
  const [bankOther, setBankOther] = useState('')
  const [photoItems, setPhotoItems] = useState<
    { key: string; preview: string; url?: string; error?: string; uploading: boolean }[]
  >([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [phoneConfirmed, setPhoneConfirmed] = useState(false)

  const patch = (partial: Partial<Answers>) =>
    setAnswers((prev) => ({ ...prev, ...partial }))

  const lead = useMemo(() => evaluateLead(answers), [answers])
  const result = useMemo(
    () => resultCopy(lead.qualified, answers.nome),
    [lead.qualified, answers.nome],
  )
  const waMessage = useMemo(
    () => buildClientWhatsAppMessage(answers),
    [answers],
  )
  const waUrl = useMemo(
    () => buildCompanyWhatsAppUrl(waMessage),
    [waMessage],
  )
  const waUrlAlt = useMemo(
    () => buildCompanyWhatsAppUrlAlt(waMessage),
    [waMessage],
  )
  const waReady = isCompanyWhatsAppReady()

  const finishQuiz = (nextAnswers: Answers) => {
    const evaluation = evaluateLead(nextAnswers)
    const record = buildLeadRecord(nextAnswers, evaluation)

    // Painel admin — salva todos (qualificado ou não)
    void saveLead(record)

    // Pixel — só qualificado
    if (evaluation.qualified) {
      trackQualifiedLead(nextAnswers, {
        quality: evaluation.quality,
        score: evaluation.score,
      })
    }
    setStep('result')
  }

  const chooseAndGo = (value: string, key: keyof Answers, next: Step) => {
    if (locking) return
    setSelected(value)
    setLocking(true)
    const nextAnswers = { ...answers, [key]: value } as Answers
    patch({ [key]: value } as Partial<Answers>)
    setTimeout(() => {
      setSelected(null)
      setLocking(false)
      if (next === 'result') finishQuiz(nextAnswers)
      else setStep(next)
    }, 400)
  }

  if (step === 'start') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <BrandMark />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground text-center leading-tight mb-4">
            O banco quer tomar seu veiculo?{' '}
            <span className="text-brand">
              Vamos comprar ele agora antes disso acontecer
            </span>
          </h1>
          <p className="text-muted-foreground text-center text-lg mb-8">
            Análise rápida e gratuita em menos de 1 minuto
          </p>
          <PrimaryButton
            className="text-xl animate-pulse-soft"
            onClick={() => setStep('contato')}
          >
            Começar agora →
          </PrimaryButton>
          <div className="mt-8 space-y-3">
            <TrustItem
              icon={<Users className="w-4 h-4" />}
              text="Mais de 1.200 pessoas já analisaram hoje"
            />
            <TrustItem icon={<Clock className="w-4 h-4" />} text="Atendimento imediato" />
            <TrustItem
              icon={<Shield className="w-4 h-4" />}
              text="Sem custo e sem compromisso"
            />
          </div>
          <FeedbackCarousel />
        </div>
      </div>
    )
  }

  if (step === 'contato') {
    const canContinue =
      answers.nome.trim().length >= 3 &&
      isValidBRMobile(answers.telefone) &&
      phoneConfirmed

    return (
      <Screen
        step={step}
        title="Seu WhatsApp"
        subtitle="Confira com cuidado — é por ele que vamos te chamar"
      >
        <div className="space-y-4 mb-6">
          <FieldShell icon={<User className="w-5 h-5" />}>
            <input
              type="text"
              placeholder="Seu nome completo"
              value={answers.nome}
              onChange={(e) => patch({ nome: e.target.value })}
              className={fieldClass}
              autoFocus
            />
          </FieldShell>
          <PhoneInput
            value={answers.telefone}
            onChange={(telefone) => patch({ telefone })}
            confirmed={phoneConfirmed}
            onConfirmedChange={setPhoneConfirmed}
          />
        </div>
        <PrimaryButton
          disabled={!canContinue}
          onClick={() => setStep('regiao')}
        >
          {phoneConfirmed ? 'Continuar →' : 'Confirme o WhatsApp acima'}
        </PrimaryButton>
      </Screen>
    )
  }

  if (step === 'regiao') {
    return (
      <Screen step={step} title="Sua região" subtitle="Onde está o veículo?">
        <div className="space-y-4 mb-6">
          <select
            className={`${fieldClass} pl-4`}
            value={answers.estado}
            onChange={(e) => patch({ estado: e.target.value })}
            autoFocus
          >
            <option value="">Estado...</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
          <FieldShell icon={<MapPin className="w-5 h-5" />}>
            <input
              type="text"
              placeholder="Cidade — Ex: São Paulo"
              value={answers.cidade}
              onChange={(e) => patch({ cidade: e.target.value })}
              className={fieldClass}
            />
          </FieldShell>
        </div>
        <PrimaryButton
          disabled={!answers.estado || answers.cidade.trim().length < 2}
          onClick={() => setStep('banco')}
        >
          Continuar →
        </PrimaryButton>
      </Screen>
    )
  }

  if (step === 'banco') {
    return (
      <Screen
        step={step}
        title="Qual banco financia seu carro?"
        subtitle="Busque ou toque no banco do financiamento."
      >
        <div className="space-y-3">
          {BANCOS.map((banco) => (
            <OptionButton
              key={banco}
              label={banco}
              selected={selected === banco}
              disabled={locking}
              onClick={() => {
                if (banco === 'Outro banco') {
                  setSelected(banco)
                  setBankModal(true)
                  return
                }
                chooseAndGo(banco, 'banco', 'veiculo')
              }}
            />
          ))}
        </div>

        {bankModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black/40">
            <div className="w-full max-w-md bg-card rounded-2xl p-6 shadow-xl animate-fade-up">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">Qual é o banco?</h3>
                <button
                  type="button"
                  onClick={() => {
                    setBankModal(false)
                    setSelected(null)
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                placeholder="Digite o nome do banco..."
                value={bankOther}
                onChange={(e) => setBankOther(e.target.value)}
                autoFocus
                maxLength={50}
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground font-medium text-base focus:border-primary focus:outline-none transition-colors mb-4"
              />
              <PrimaryButton
                disabled={!bankOther.trim()}
                onClick={() => {
                  patch({ banco: bankOther.trim() })
                  setBankModal(false)
                  setBankOther('')
                  setSelected(null)
                  setStep('veiculo')
                }}
              >
                Confirmar →
              </PrimaryButton>
            </div>
          </div>
        )}
      </Screen>
    )
  }

  if (step === 'veiculo') {
    return (
      <Screen
        step={step}
        title="Seu veículo"
        subtitle="Marca, modelo e ano — bem rápido."
      >
        <div className="space-y-4 mb-6">
          <FieldShell icon={<Car className="w-5 h-5" />}>
            <input
              type="text"
              placeholder="Marca — Ex: Toyota"
              value={answers.marca}
              onChange={(e) => patch({ marca: e.target.value })}
              className={fieldClass}
              autoFocus
            />
          </FieldShell>
          <FieldShell icon={<Car className="w-5 h-5" />}>
            <input
              type="text"
              placeholder="Modelo — Ex: Corolla"
              value={answers.modelo}
              onChange={(e) => patch({ modelo: e.target.value })}
              className={fieldClass}
            />
          </FieldShell>
          <FieldShell icon={<Calendar className="w-5 h-5" />}>
            <select
              className={fieldClass}
              value={answers.ano}
              onChange={(e) => patch({ ano: e.target.value })}
            >
              <option value="">Ano...</option>
              {ANOS.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </FieldShell>
        </div>
        <PrimaryButton
          disabled={
            !answers.marca.trim() || !answers.modelo.trim() || !answers.ano
          }
          onClick={() => setStep('atrasadas')}
        >
          Continuar →
        </PrimaryButton>
      </Screen>
    )
  }

  if (step === 'atrasadas') {
    return (
      <Screen
        step={step}
        title="Parcelas atrasadas?"
        subtitle="Toque na opção e siga."
      >
        <div className="space-y-3">
          {PARCELAS_ATRASADAS.map((opt) => (
            <OptionButton
              key={opt}
              label={opt}
              selected={selected === opt}
              disabled={locking}
              onClick={() => chooseAndGo(opt, 'parcelasAtrasadas', 'entrada')}
            />
          ))}
        </div>
      </Screen>
    )
  }

  if (step === 'entrada') {
    return (
      <Screen
        step={step}
        title="Qual foi o valor da entrada?"
        subtitle='Se não deu entrada, toque em "Não dei entrada".'
      >
        <div className="space-y-4 mb-6">
          <OptionButton
            label="Não dei entrada"
            selected={answers.deuEntrada === 'nao'}
            onClick={() => {
              patch({ deuEntrada: 'nao', valorEntrada: '' })
              setStep('pagas')
            }}
          />
          <FieldShell icon={<DollarSign className="w-5 h-5" />}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex: 5.000"
              value={answers.valorEntrada}
              onChange={(e) =>
                patch({
                  valorEntrada: formatMoneyInput(e.target.value),
                  deuEntrada: e.target.value ? 'sim' : '',
                })
              }
              className={fieldClass}
              autoFocus
            />
          </FieldShell>
          <p className="text-center text-xs text-muted-foreground">
            Valor pago de entrada no financiamento
          </p>
        </div>
        <PrimaryButton
          disabled={!answers.valorEntrada}
          onClick={() => {
            patch({ deuEntrada: 'sim' })
            setStep('pagas')
          }}
        >
          Continuar →
        </PrimaryButton>
      </Screen>
    )
  }

  if (step === 'pagas') {
    return (
      <Screen
        step={step}
        title="Parcelas já pagas?"
        subtitle="Toque na faixa aproximada."
      >
        <div className="space-y-3">
          {PARCELAS_PAGAS.map((opt) => (
            <OptionButton
              key={opt}
              label={opt}
              selected={selected === opt}
              disabled={locking}
              onClick={() => chooseAndGo(opt, 'parcelasPagas', 'debito')}
            />
          ))}
        </div>
      </Screen>
    )
  }

  if (step === 'debito') {
    return (
      <Screen
        step={step}
        title="Tem débito de IPVA ou multas?"
        subtitle="Se não tiver, toque em Não."
      >
        {answers.temDebito === '' && (
          <div className="space-y-3">
            <OptionButton
              label="Sim"
              onClick={() => patch({ temDebito: 'sim' })}
            />
            <OptionButton
              label="Não"
              onClick={() => {
                patch({ temDebito: 'nao', valorDebito: '' })
                setStep('final')
              }}
            />
          </div>
        )}

        {answers.temDebito === 'sim' && (
          <div className="animate-fade-up">
            <div className="mb-6">
              <FieldShell icon={<DollarSign className="w-5 h-5" />}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Valor total de IPVA, multas..."
                  value={answers.valorDebito}
                  onChange={(e) =>
                    patch({ valorDebito: formatMoneyInput(e.target.value) })
                  }
                  className={fieldClass}
                  autoFocus
                />
              </FieldShell>
            </div>
            <PrimaryButton
              disabled={!answers.valorDebito}
              onClick={() => setStep('final')}
            >
              Continuar →
            </PrimaryButton>
          </div>
        )}
      </Screen>
    )
  }

  if (step === 'final') {
    return (
      <Screen
        step={step}
        title="Últimos detalhes"
        subtitle="Quilometragem e se já rodou em app."
      >
        <div className="space-y-4 mb-6">
          <FieldShell icon={<Gauge className="w-5 h-5" />}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Km — Ex: 45000"
              value={answers.quilometragem}
              onChange={(e) =>
                patch({ quilometragem: onlyDigits(e.target.value).slice(0, 7) })
              }
              className={fieldClass}
              autoFocus
            />
          </FieldShell>
          <p className="text-center text-sm font-semibold text-foreground pt-2">
            Já rodou em Uber, 99 ou iFood?
          </p>
          <div className="space-y-3">
            <OptionButton
              label="Sim"
              selected={answers.usaParaAplicativo === 'sim'}
              disabled={!answers.quilometragem || locking}
              onClick={() => {
                if (!answers.quilometragem) return
                chooseAndGo('sim', 'usaParaAplicativo', 'fotos')
              }}
            />
            <OptionButton
              label="Não"
              selected={answers.usaParaAplicativo === 'nao'}
              disabled={!answers.quilometragem || locking}
              onClick={() => {
                if (!answers.quilometragem) return
                chooseAndGo('nao', 'usaParaAplicativo', 'fotos')
              }}
            />
          </div>
        </div>
      </Screen>
    )
  }

  if (step === 'fotos') {
    const uploading = photoItems.some((p) => p.uploading)
    const readyUrls = photoItems
      .filter((p) => p.url && !p.error)
      .map((p) => p.url!)

    const addFiles = async (files: FileList | null) => {
      if (!files?.length || photoBusy) return
      const remaining = MAX_PHOTOS - photoItems.length
      if (remaining <= 0) return
      const list = [...files].slice(0, remaining)
      setPhotoBusy(true)
      for (const file of list) {
        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
        const preview = URL.createObjectURL(file)
        setPhotoItems((prev) => [
          ...prev,
          { key, preview, uploading: true },
        ])
        try {
          const uploaded = await uploadLeadPhoto(file)
          setPhotoItems((prev) =>
            prev.map((p) =>
              p.key === key
                ? { ...p, url: uploaded.url, uploading: false }
                : p,
            ),
          )
        } catch (e) {
          setPhotoItems((prev) =>
            prev.map((p) =>
              p.key === key
                ? {
                    ...p,
                    uploading: false,
                    error: e instanceof Error ? e.message : 'Erro no envio',
                  }
                : p,
            ),
          )
        }
      }
      setPhotoBusy(false)
    }

    const removePhoto = (key: string) => {
      setPhotoItems((prev) => {
        const item = prev.find((p) => p.key === key)
        if (item?.preview) URL.revokeObjectURL(item.preview)
        return prev.filter((p) => p.key !== key)
      })
    }

    const goFinish = (urls: string[]) => {
      const nextAnswers = { ...answers, fotosUrls: urls }
      patch({ fotosUrls: urls })
      finishQuiz(nextAnswers)
    }

    return (
      <Screen
        step={step}
        title="Fotos do seu carro"
        subtitle="Adicionar fotos do carro ajuda bastante na negociação e na proposta."
        last
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#ffe0c2] bg-secondary px-4 py-3 text-sm text-secondary-foreground font-medium text-center">
            Quanto mais claras as fotos (frente, lateral e painel), mais rápido
            conseguimos avaliar.
          </div>

          <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card px-4 py-8 cursor-pointer hover:border-primary hover:bg-secondary/60 transition-colors">
            <div className="w-12 h-12 rounded-2xl bg-soft text-brand flex items-center justify-center">
              <ImagePlus className="w-6 h-6" />
            </div>
            <span className="font-bold text-foreground">
              Selecionar fotos do carro
            </span>
            <span className="text-xs text-muted-foreground font-medium">
              Até {MAX_PHOTOS} fotos · câmera ou galeria
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              multiple
              className="hidden"
              disabled={photoItems.length >= MAX_PHOTOS || uploading}
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>

          {photoItems.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoItems.map((p) => (
                <div
                  key={p.key}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted"
                >
                  <img
                    src={p.preview}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {p.uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  {p.error && (
                    <div className="absolute inset-0 bg-destructive/80 text-white text-[10px] font-bold p-1 flex items-center justify-center text-center">
                      {p.error}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remover foto"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    onClick={() => removePhoto(p.key)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <PrimaryButton
            disabled={uploading || readyUrls.length === 0}
            onClick={() => goFinish(readyUrls)}
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando fotos…
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                Enviar fotos e finalizar
              </>
            )}
          </PrimaryButton>

          <button
            type="button"
            disabled={uploading}
            onClick={() => goFinish([])}
            className="w-full py-3.5 px-6 rounded-2xl font-bold text-base border-2 border-border bg-white text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Continuar sem enviar fotos
          </button>
        </div>
      </Screen>
    )
  }

  // result — ok (qualificado) ou não qualifica
  const qualified = lead.qualified

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="text-6xl mb-4">{result.emoji}</div>
        <h2
          className={`text-2xl sm:text-3xl font-extrabold mb-3 ${
            qualified ? 'text-foreground' : 'text-destructive'
          }`}
        >
          {result.title}
        </h2>
        <p className="text-lg text-muted-foreground mb-6">{result.text}</p>

        {qualified && (
          <div className="rounded-2xl border-2 border-[#25D366]/40 bg-[#25D366]/5 px-4 py-3 mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Seu WhatsApp confirmado
            </p>
            <p className="text-xl font-extrabold tabular-nums mt-0.5">
              {displayPhone(answers.telefone)}
            </p>
          </div>
        )}

        {qualified && waReady && waUrl ? (
          <div className="space-y-3 mb-8">
            <a
              href={waUrl}
              className="w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 bg-[#25D366] text-white shadow-lg shadow-[#25D366]/35 hover:brightness-105 animate-pulse-soft"
            >
              <MessageCircle className="w-6 h-6" />
              Abrir WhatsApp e enviar
            </a>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              1) Toque no botão verde
              <br />
              2) No WhatsApp, toque em <strong className="text-foreground">Enviar</strong>
              <br />
              Não precisa digitar nada — a mensagem já vai pronta.
            </p>
            {waUrlAlt && (
              <a
                href={waUrlAlt}
                className="block text-sm font-bold text-[#128C7E] underline underline-offset-2"
              >
                Não abriu? Tente este link alternativo
                {formatCompanyWhatsAppDisplay()
                  ? ` (${formatCompanyWhatsAppDisplay()})`
                  : ''}
              </a>
            )}
          </div>
        ) : null}

        {qualified && !waReady ? (
          <div className="space-y-3 mb-8">
            <TrustItem
              icon={<MessageCircle className="w-4 h-4 text-[#25D366]" />}
              text={`Vamos te chamar no ${displayPhone(answers.telefone)}`}
            />
            {import.meta.env.DEV && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-left">
                Dev: configure <code>VITE_WHATSAPP_NUMBER</code> (ex.:
                5511987654321) para liberar o botão verde.
              </p>
            )}
          </div>
        ) : null}

        <div className="space-y-3">
          {qualified ? (
            <>
              <TrustItem
                icon={<Check className="w-4 h-4 text-success" />}
                text="Dados recebidos com sucesso"
              />
              <TrustItem
                icon={<MessageCircle className="w-4 h-4 text-[#25D366]" />}
                text="Atendimento pelo WhatsApp"
              />
              <TrustItem
                icon={<Shield className="w-4 h-4" />}
                text="Seus dados estão seguros"
              />
            </>
          ) : (
            <>
              <TrustItem
                icon={<Shield className="w-4 h-4 text-destructive" />}
                text="Seus dados ficam seguros conosco"
              />
              <TrustItem
                icon={<Clock className="w-4 h-4 text-destructive" />}
                text="Podemos reavaliar seu caso no futuro"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
