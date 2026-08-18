import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Download,
  Eraser,
  FileText,
  PenLine,
  Printer,
  Stamp,
} from 'lucide-react'

type SignMode = 'digital' | 'fisica'

type FormData = {
  clienteNome: string
  clienteCpf: string
  clienteRg: string
  clienteEndereco: string
  clienteCidade: string
  clienteTelefone: string
  veiculoModelo: string
  veiculoAno: string
  veiculoPlaca: string
  veiculoCor: string
  veiculoChassi: string
  veiculoRenavam: string
  valorAcordo: string
  debitoBanco: string
  banco: string
  cidadeContrato: string
  dataContrato: string
  empresaNome: string
  empresaCnpj: string
  empresaRep: string
  empresaEndereco: string
}

const DEFAULTS: FormData = {
  clienteNome: '',
  clienteCpf: '',
  clienteRg: '',
  clienteEndereco: '',
  clienteCidade: '',
  clienteTelefone: '',
  veiculoModelo: '',
  veiculoAno: '',
  veiculoPlaca: '',
  veiculoCor: '',
  veiculoChassi: '',
  veiculoRenavam: '',
  valorAcordo: '',
  debitoBanco: '',
  banco: '',
  cidadeContrato: 'São Paulo',
  dataContrato: new Date().toISOString().slice(0, 10),
  empresaNome: 'Alpha Recupera',
  empresaCnpj: '',
  empresaRep: 'Representante legal',
  empresaEndereco: '',
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-muted uppercase tracking-wide">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-line px-3 py-2 text-sm outline-none focus:border-brand bg-white"
      />
    </label>
  )
}

function dash(v: string, fallback = '________________') {
  const t = v.trim()
  return t || fallback
}

function formatDateBr(iso: string) {
  if (!iso) return '___/___/______'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string) => void
  disabled?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = Math.floor(w * ratio)
    canvas.height = Math.floor(h * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1a1a1a'
  }, [])

  const pos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    onChange('')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Assinatura do cliente</p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-line hover:bg-soft disabled:opacity-50"
        >
          <Eraser className="w-3.5 h-3.5" />
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className={`w-full h-36 rounded-2xl border-2 border-dashed border-line bg-white touch-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'
        }`}
        onPointerDown={(e) => {
          if (disabled) return
          drawing.current = true
          const ctx = canvasRef.current?.getContext('2d')
          if (!ctx) return
          const { x, y } = pos(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drawing.current || disabled) return
          const ctx = canvasRef.current?.getContext('2d')
          if (!ctx) return
          const { x, y } = pos(e)
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={() => {
          drawing.current = false
          const canvas = canvasRef.current
          if (canvas) onChange(canvas.toDataURL('image/png'))
        }}
      />
      <p className="text-xs text-muted font-medium">
        Peça para o cliente assinar aqui (dedo ou mouse), ou baixe em branco
        para o Gov.br.
      </p>
    </div>
  )
}

/** Carimbo visual da assinatura do escritório (já pronta no contrato). */
function OfficeStamp({
  empresaNome,
  representante,
}: {
  empresaNome: string
  representante: string
}) {
  return (
    <div className="office-stamp text-center px-2">
      <svg
        viewBox="0 0 280 70"
        className="mx-auto h-14 w-auto text-brand"
        aria-hidden
      >
        <path
          d="M12 48 C 40 10, 70 60, 100 28 S 160 10, 190 40 S 240 55, 268 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M30 52 C 55 35, 80 55, 110 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
      <p className="text-sm font-extrabold tracking-tight mt-1">
        {empresaNome || 'Alpha Recupera'}
      </p>
      <p className="text-[11px] text-muted font-medium">
        {representante || 'Representante legal'} · Assinatura do escritório
      </p>
    </div>
  )
}

export function Contrato() {
  const [form, setForm] = useState<FormData>(DEFAULTS)
  const [mode, setMode] = useState<SignMode>('digital')
  const [includeClientSign, setIncludeClientSign] = useState(true)
  const [clientSign, setClientSign] = useState('')
  const printRef = useRef<HTMLDivElement | null>(null)

  const set =
    (key: keyof FormData) =>
    (v: string) =>
      setForm((prev) => ({ ...prev, [key]: v }))

  const showClientPad = mode === 'digital' && includeClientSign
  const showClientBlank =
    mode === 'fisica' || (mode === 'digital' && !includeClientSign)

  const printContract = () => {
    window.print()
  }

  const downloadHtml = (blankClient: boolean) => {
    const node = printRef.current
    if (!node) return
    const clone = node.cloneNode(true) as HTMLElement
    if (blankClient) {
      clone.querySelectorAll('[data-client-sign]').forEach((el) => {
        el.innerHTML =
          '<div style="min-height:64px;border-bottom:1px solid #999;margin-top:24px"></div><p style="font-size:11px;color:#666;margin-top:6px">Assinatura do cliente (Gov.br ou de próprio punho)</p>'
      })
    }
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Contrato — ${dash(form.clienteNome, 'Cliente')} — Alpha Recupera</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:32px;line-height:1.45;font-size:13px}
  h1{font-size:18px;text-align:center;margin:0 0 8px}
  h2{font-size:13px;margin:18px 0 8px}
  .muted{color:#555;font-size:12px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:36px}
  .sign{border-top:1px solid #bbb;padding-top:8px;text-align:center;min-height:90px}
  img.sign-img{max-height:70px;margin:0 auto;display:block}
  @media print{body{margin:12mm}}
</style>
</head>
<body>${clone.innerHTML}</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contrato-${(form.clienteNome || 'cliente')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-5xl space-y-5">
      <section className="rounded-3xl bg-white border border-line p-5 sm:p-6 no-print">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-soft text-brand flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight">Contrato</h2>
            <p className="text-sm text-muted font-medium mt-0.5">
              Modelo pronto com assinatura do escritório. Preencha os dados,
              escolha assinatura digital ou física e baixe.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            onClick={() => setMode('digital')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold ${
              mode === 'digital'
                ? 'btn-brand shadow-none'
                : 'bg-[#fff8ef] text-[#4b5563] hover:bg-soft'
            }`}
          >
            <PenLine className="w-4 h-4" />
            Assinatura digital
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('fisica')
              setIncludeClientSign(false)
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold ${
              mode === 'fisica'
                ? 'btn-brand shadow-none'
                : 'bg-[#fff8ef] text-[#4b5563] hover:bg-soft'
            }`}
          >
            <Stamp className="w-4 h-4" />
            Assinatura física / Gov.br
          </button>
        </div>

        {mode === 'digital' && (
          <label className="flex items-center gap-2 text-sm font-semibold mb-4">
            <input
              type="checkbox"
              checked={includeClientSign}
              onChange={(e) => setIncludeClientSign(e.target.checked)}
            />
            Incluir assinatura do cliente neste arquivo
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field
            label="Cliente — nome"
            value={form.clienteNome}
            onChange={set('clienteNome')}
            placeholder="Nome completo"
          />
          <Field
            label="CPF"
            value={form.clienteCpf}
            onChange={set('clienteCpf')}
            placeholder="000.000.000-00"
          />
          <Field
            label="RG"
            value={form.clienteRg}
            onChange={set('clienteRg')}
          />
          <Field
            label="Telefone"
            value={form.clienteTelefone}
            onChange={set('clienteTelefone')}
          />
          <Field
            label="Endereço"
            value={form.clienteEndereco}
            onChange={set('clienteEndereco')}
          />
          <Field
            label="Cidade / UF"
            value={form.clienteCidade}
            onChange={set('clienteCidade')}
          />
          <Field
            label="Veículo — modelo"
            value={form.veiculoModelo}
            onChange={set('veiculoModelo')}
            placeholder="Ex.: Gol 1.0"
          />
          <Field
            label="Ano"
            value={form.veiculoAno}
            onChange={set('veiculoAno')}
          />
          <Field
            label="Placa"
            value={form.veiculoPlaca}
            onChange={set('veiculoPlaca')}
          />
          <Field
            label="Cor"
            value={form.veiculoCor}
            onChange={set('veiculoCor')}
          />
          <Field
            label="Chassi"
            value={form.veiculoChassi}
            onChange={set('veiculoChassi')}
          />
          <Field
            label="Renavam"
            value={form.veiculoRenavam}
            onChange={set('veiculoRenavam')}
          />
          <Field
            label="Banco / financeira"
            value={form.banco}
            onChange={set('banco')}
          />
          <Field
            label="Débito com o banco"
            value={form.debitoBanco}
            onChange={set('debitoBanco')}
            placeholder="R$ 0,00"
          />
          <Field
            label="Valor do acordo"
            value={form.valorAcordo}
            onChange={set('valorAcordo')}
            placeholder="R$ 0,00"
          />
          <Field
            label="Cidade do contrato"
            value={form.cidadeContrato}
            onChange={set('cidadeContrato')}
          />
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted uppercase tracking-wide">
              Data
            </span>
            <input
              type="date"
              value={form.dataContrato}
              onChange={(e) => set('dataContrato')(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2 text-sm outline-none focus:border-brand bg-white"
            />
          </label>
          <Field
            label="Empresa"
            value={form.empresaNome}
            onChange={set('empresaNome')}
          />
          <Field
            label="CNPJ da empresa"
            value={form.empresaCnpj}
            onChange={set('empresaCnpj')}
            placeholder="00.000.000/0000-00"
          />
          <Field
            label="Representante (escritório)"
            value={form.empresaRep}
            onChange={set('empresaRep')}
          />
          <Field
            label="Endereço da empresa"
            value={form.empresaEndereco}
            onChange={set('empresaEndereco')}
          />
        </div>

        {showClientPad && (
          <div className="mt-5 rounded-2xl border border-line bg-[#fffaf3] p-4">
            <SignaturePad onChange={setClientSign} />
          </div>
        )}

        {mode === 'fisica' && (
          <p className="mt-4 text-sm text-muted font-medium rounded-2xl bg-[#fffaf3] border border-line px-4 py-3">
            Modo físico / Gov.br: o contrato sai com a assinatura da Alpha já
            pronta e espaço em branco para o cliente assinar no papel ou no
            Gov.br.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={printContract}
            className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            <Printer className="w-4 h-4" />
            Imprimir / salvar PDF
          </button>
          <button
            type="button"
            onClick={() => downloadHtml(false)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border border-line bg-white hover:bg-soft"
          >
            <Download className="w-4 h-4" />
            Baixar contrato
          </button>
          <button
            type="button"
            onClick={() => downloadHtml(true)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold border border-line bg-white hover:bg-soft"
          >
            <Download className="w-4 h-4" />
            Baixar sem assinatura do cliente
          </button>
        </div>
      </section>

      {/* Preview + print area */}
      <section className="rounded-3xl bg-white border border-line p-5 sm:p-8 print:border-0 print:rounded-none print:p-0">
        <div ref={printRef} id="contrato-print" className="contrato-doc">
          <div className="flex items-center justify-between gap-4 mb-6 print:mb-4">
            <img
              src="/logo.png"
              alt="Alpha Recupera"
              className="h-12 w-auto object-contain"
            />
            <div className="text-right text-xs text-muted font-medium">
              <p className="font-bold text-ink text-sm">
                {form.empresaNome || 'Alpha Recupera'}
              </p>
              {form.empresaCnpj && <p>CNPJ {form.empresaCnpj}</p>}
              {form.empresaEndereco && <p>{form.empresaEndereco}</p>}
            </div>
          </div>

          <h1 className="text-center text-lg sm:text-xl font-extrabold tracking-tight mb-1">
            CONTRATO DE COMPRA E VENDA DE VEÍCULO
          </h1>
          <p className="text-center text-xs text-muted font-medium mb-6">
            Instrumento particular · {form.cidadeContrato || 'São Paulo'},{' '}
            {formatDateBr(form.dataContrato)}
          </p>

          <p className="text-sm leading-relaxed mb-4">
            Pelo presente instrumento particular, de um lado{' '}
            <strong>{dash(form.empresaNome, 'ALPHA RECUPERA')}</strong>
            {form.empresaCnpj ? `, inscrita no CNPJ sob nº ${form.empresaCnpj},` : ','}{' '}
            com sede em {dash(form.empresaEndereco, '[endereço da empresa]')},
            neste ato representada por{' '}
            <strong>{dash(form.empresaRep)}</strong>, doravante denominada{' '}
            <strong>COMPRADORA</strong>; e de outro lado{' '}
            <strong>{dash(form.clienteNome, '[NOME DO CLIENTE]')}</strong>,
            portador(a) do CPF {dash(form.clienteCpf, '[CPF]')}
            {form.clienteRg ? ` e RG ${form.clienteRg}` : ''}, residente em{' '}
            {dash(form.clienteEndereco, '[endereço]')},{' '}
            {dash(form.clienteCidade, '[cidade/UF]')}
            {form.clienteTelefone ? `, telefone ${form.clienteTelefone}` : ''},
            doravante denominado(a) <strong>VENDEDOR(A)</strong>, têm entre si
            justo e contratado o seguinte:
          </p>

          <h2 className="text-sm font-extrabold mt-5 mb-2">
            CLÁUSULA 1ª — DO OBJETO
          </h2>
          <p className="text-sm leading-relaxed">
            O(A) VENDEDOR(A) vende, cede e transfere à COMPRADORA o veículo:{' '}
            <strong>{dash(form.veiculoModelo, '[modelo]')}</strong>, ano{' '}
            <strong>{dash(form.veiculoAno, '[ano]')}</strong>, placa{' '}
            <strong>{dash(form.veiculoPlaca, '[placa]')}</strong>
            {form.veiculoCor ? `, cor ${form.veiculoCor}` : ''}
            {form.veiculoChassi ? `, chassi ${form.veiculoChassi}` : ''}
            {form.veiculoRenavam ? `, Renavam ${form.veiculoRenavam}` : ''}.
          </p>

          <h2 className="text-sm font-extrabold mt-5 mb-2">
            CLÁUSULA 2ª — DO PREÇO E CONDIÇÕES
          </h2>
          <p className="text-sm leading-relaxed">
            O valor do acordo é de{' '}
            <strong>{dash(form.valorAcordo, '[valor do acordo]')}</strong>
            {form.debitoBanco
              ? `, considerando débito junto a ${dash(form.banco, 'instituição financeira')} no montante de ${form.debitoBanco}`
              : form.banco
                ? `, com financiamento junto a ${form.banco}`
                : ''}
            . A COMPRADORA poderá quitar ou negociar débitos vinculados ao
            veículo, conforme combinado entre as partes.
          </p>

          <h2 className="text-sm font-extrabold mt-5 mb-2">
            CLÁUSULA 3ª — DAS OBRIGAÇÕES
          </h2>
          <p className="text-sm leading-relaxed">
            O(A) VENDEDOR(A) declara ser legítimo possuidor/proprietário do
            veículo (ou ter poderes para aliená-lo), compromete-se a entregar a
            documentação necessária e autoriza a COMPRADORA a adotar as
            providências para regularização, transferência e quitação junto ao
            banco, quando aplicável.
          </p>

          <h2 className="text-sm font-extrabold mt-5 mb-2">
            CLÁUSULA 4ª — DA ENTREGA
          </h2>
          <p className="text-sm leading-relaxed">
            A entrega do veículo e documentos ocorrerá na forma e prazo
            combinados entre as partes, podendo ser registrados em termo de
            recebimento anexo.
          </p>

          <h2 className="text-sm font-extrabold mt-5 mb-2">
            CLÁUSULA 5ª — DO FORO
          </h2>
          <p className="text-sm leading-relaxed">
            As partes elegem o foro da comarca de{' '}
            {dash(form.cidadeContrato, 'São Paulo')} para dirimir quaisquer
            dúvidas oriundas deste contrato, com renúncia a qualquer outro, por
            mais privilegiado que seja.
          </p>

          <p className="text-sm leading-relaxed mt-5">
            E, por estarem assim justas e contratadas, as partes assinam o
            presente instrumento.
          </p>

          <p className="text-sm font-semibold mt-6 mb-8">
            {dash(form.cidadeContrato, 'São Paulo')},{' '}
            {formatDateBr(form.dataContrato)}.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-10">
            <div className="sign-box border-t border-[#bbb] pt-3 text-center min-h-[120px]">
              <OfficeStamp
                empresaNome={form.empresaNome}
                representante={form.empresaRep}
              />
              <p className="text-xs font-bold mt-3">COMPRADORA</p>
              <p className="text-[11px] text-muted">
                Assinatura do escritório (já aplicada)
              </p>
            </div>

            <div
              className="sign-box border-t border-[#bbb] pt-3 text-center min-h-[120px]"
              data-client-sign
            >
              {showClientPad && clientSign ? (
                <img
                  src={clientSign}
                  alt="Assinatura do cliente"
                  className="sign-img mx-auto max-h-[70px]"
                />
              ) : showClientBlank ? (
                <div className="h-16 border-b border-[#999] mt-6 mb-2" />
              ) : (
                <div className="h-16 border-b border-dashed border-[#ccc] mt-6 mb-2 flex items-end justify-center text-[11px] text-muted pb-1">
                  Aguardando assinatura digital
                </div>
              )}
              <p className="text-xs font-bold mt-3">
                {dash(form.clienteNome, 'VENDEDOR(A)')}
              </p>
              <p className="text-[11px] text-muted">
                {mode === 'fisica' || !includeClientSign
                  ? 'Espaço para assinatura física ou Gov.br'
                  : 'Assinatura do cliente'}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-muted mt-10 leading-relaxed">
            Documento gerado no painel Alpha Recupera. A assinatura do
            escritório consta pré-aplicada. Quando baixado sem a assinatura do
            cliente, destina-se à assinatura manuscrita ou via Gov.br / ICP-Brasil.
          </p>
        </div>
      </section>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #contrato-print, #contrato-print * { visibility: visible !important; }
          #contrato-print {
            position: absolute !important;
            left: 0; top: 0; width: 100%;
            padding: 12mm !important;
          }
          .no-print { display: none !important; }
          aside, header { display: none !important; }
        }
      `}</style>
    </div>
  )
}
