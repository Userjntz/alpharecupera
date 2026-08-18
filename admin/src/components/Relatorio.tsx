import { BarChart3 } from 'lucide-react'

/** Placeholder — conteúdo a definir */
export function Relatorio() {
  return (
    <div className="max-w-3xl">
      <div className="rounded-3xl border border-line bg-white px-6 py-12 text-center">
        <div className="w-12 h-12 rounded-2xl bg-soft text-brand flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">Relatório</h2>
        <p className="mt-2 text-sm text-muted font-medium max-w-md mx-auto">
          Aba pronta. Em breve você define o que entra aqui.
        </p>
      </div>
    </div>
  )
}
