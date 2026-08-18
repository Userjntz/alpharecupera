export type Feedback = {
  id: string
  name: string
  city: string
  car: string
  quote: string
  image: string
}

export const FEEDBACKS: Feedback[] = [
  {
    id: '1',
    name: 'Marcos A.',
    city: 'São Paulo, SP',
    car: 'Onix 2019',
    quote:
      'Fui atender o pessoal da Alpha e já saí com a proposta. Resolveu meu aperto com o banco no mesmo dia.',
    image: '/feedbacks/01.png',
  },
  {
    id: '2',
    name: 'Carlos M.',
    city: 'Guarulhos, SP',
    car: 'Onix 2019',
    quote:
      'Estava com o banco em cima e a Alpha resolveu rápido. Saí do aperto e ainda recebi pelo carro.',
    image: '/feedbacks/02.png',
  },
  {
    id: '3',
    name: 'Juliana R.',
    city: 'Campinas, SP',
    car: 'HB20 2020',
    quote:
      'Achei que ia perder o carro. Em menos de 24h já tinham proposta. Atendimento sem enrolação.',
    image: '/feedbacks/03.png',
  },
  {
    id: '4',
    name: 'Rafael S.',
    city: 'Osasco, SP',
    car: 'Cronos 2021',
    quote:
      'Mandei o quiz, me chamaram no WhatsApp e fechamos. Muito mais simples do que eu imaginava.',
    image: '/feedbacks/04.png',
  },
  {
    id: '5',
    name: 'Amanda L.',
    city: 'Santos, SP',
    car: 'Argo 2018',
    quote:
      'Estava atrasada e sem saída. Eles compraram o carro e eu respirei aliviada. Recomendo demais.',
    image: '/feedbacks/05.png',
  },
]
