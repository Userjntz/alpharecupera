import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const ITEMS = [
  {
    q: 'Como funciona a Alpha Recupera?',
    a: 'A Alpha Recupera compra e vende veículos com atendimento personalizado. Você pode vender o seu carro — inclusive financiado ou com parcelas atrasadas — ou escolher um veículo no catálogo e negociar as condições direto com a gente.',
  },
  {
    q: 'Quais carros vocês compram?',
    a: 'Trabalhamos com veículos a partir de 2015, de diversas marcas. Cada caso é avaliado individualmente: modelo, ano, quilometragem, estado de conservação e situação financeira do financiamento.',
  },
  {
    q: 'Vocês aceitam carro financiado ou com parcelas atrasadas?',
    a: 'Sim. Esse é um dos nossos focos. Se o carro está financiado, com atraso ou você precisa quitar o banco, fazemos a análise e apresentamos uma proposta. Preencha o quiz ou fale no WhatsApp para começar.',
  },
  {
    q: 'Como faço para vender meu carro?',
    a: 'É só preencher a avaliação no site. Em poucos minutos você informa os dados do veículo e da parcela. Nossa equipe analisa e entra em contato com as condições. Também atendemos pelo WhatsApp.',
  },
  {
    q: 'Como compro um veículo do catálogo?',
    a: 'Navegue pelos carros disponíveis, abra o anúncio que te interessar e chame no WhatsApp. Confirmamos disponibilidade, combinamos visita e alinhamos pagamento e documentação com você.',
  },
  {
    q: 'Os preços do catálogo são finais?',
    a: 'Os valores anunciados são uma referência. Preço e disponibilidade estão sujeitos a confirmação no atendimento. Condições de pagamento são pensadas para o seu perfil.',
  },
  {
    q: 'Preciso dar entrada para comprar?',
    a: 'Depende do veículo e da sua situação. Montamos o pagamento caso a caso — com ou sem entrada — para caber no seu momento. Fale com a gente que explicamos as opções.',
  },
  {
    q: 'Vocês cuidam da documentação e da transferência?',
    a: 'Sim. Orientamos e acompanhamos a transferência, débitos e regularização. O objetivo é um processo seguro e transparente, do início ao fim.',
  },
  {
    q: 'Posso ver o carro antes de fechar negócio?',
    a: 'Pode. Combinamos visita, fotos extras ou vídeo pelo WhatsApp. Queremos que você compre com tranquilidade.',
  },
  {
    q: 'Em quanto tempo recebo se eu vender o carro?',
    a: 'Depois da análise e da aprovação da proposta, alinhamos a documentação e o pagamento. O prazo varia conforme o banco, débitos e regularização do veículo. Na conversa você recebe uma previsão clara.',
  },
  {
    q: 'Os carros à venda têm garantia?',
    a: 'Cada veículo tem suas condições. No atendimento informamos o que está incluso, o estado do carro e o que foi conferido. Nada de surpresa na hora de fechar.',
  },
  {
    q: 'Como falo com o atendimento?',
    a: 'Pelo WhatsApp, pelo e-mail contato@alpharecupera.com.br ou pelo quiz de avaliação. O atendimento é personalizado do início ao fim.',
  },
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="bg-[#f7f7f8] border-t border-[#ececec]">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
        <div className="max-w-3xl mb-8 sm:mb-10">
          <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-[#2b2b2b]">
            Perguntas frequentes
          </h2>
          <p className="mt-2 text-[14px] sm:text-[15px] text-[#6b7280] font-medium">
            Tudo o que você precisa saber para comprar ou vender com a Alpha
            Recupera.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#ececec] overflow-hidden">
          {ITEMS.map((item, i) => {
            const isOpen = open === i
            return (
              <div
                key={item.q}
                className={i > 0 ? 'border-t border-[#ececec]' : ''}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-4 sm:px-6 py-4 sm:py-5"
                  aria-expanded={isOpen}
                >
                  <span className="text-[14px] sm:text-[16px] font-bold text-[#2b2b2b]">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 text-[#6b7280] transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen ? (
                  <div className="px-4 sm:px-6 pb-5 -mt-1">
                    <p className="text-[14px] sm:text-[15px] leading-relaxed text-[#4b5563] font-medium max-w-3xl">
                      {item.a}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
