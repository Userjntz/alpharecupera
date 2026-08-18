import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calcProposta,
  extractFromAnnotationText,
  extractPropostaInput,
  parseCount,
  parseMoneyBRL,
} from './proposta.ts'

describe('parse helpers', () => {
  it('lê dinheiro BR', () => {
    assert.equal(parseMoneyBRL('R$ 1.250,00'), 1250)
    assert.equal(parseMoneyBRL('800'), 800)
    assert.equal(parseMoneyBRL('45.000'), 45000)
    assert.equal(parseMoneyBRL('R$ 4.500'), 4500)
    assert.equal(parseMoneyBRL('1.250.000'), 1250000)
    assert.equal(parseMoneyBRL('R$ 52.341,00'), 52341)
  })

  it('lê faixas do quiz', () => {
    assert.equal(parseCount('Nenhuma'), 0)
    assert.equal(parseCount('4 a 6'), 5)
    assert.equal(parseCount('Mais de 10'), 12)
    assert.equal(parseCount('48'), 48)
  })
})

describe('calcProposta', () => {
  it('usa parcelas para o valor e mostra débitos vs FIPE', () => {
    const r = calcProposta({
      fipe: 50000,
      valorParcela: 2000,
      quantasVezes: 48,
      parcelasPagas: 10,
      parcelasAtrasadas: 4,
      debitos: 2000,
    })
    assert.equal(r.totalContrato, 2000 * 48)
    assert.equal(r.valorPago, 2000 * 10)
    assert.equal(r.valorAtraso, 2000 * 4)
    assert.equal(r.saldoBanco, 2000 * 38)
    assert.equal(r.obrigacao, 2000 * 38 + 2000)
    assert.equal(r.acimaFipe, true)
    assert.equal(r.pagarMin, 5000)
    assert.equal(r.pagarMax, 10000)
    assert.ok(r.percentualSugerido >= 10 && r.percentualSugerido <= 20)
    const semDebito = calcProposta({
      fipe: 50000,
      valorParcela: 2000,
      quantasVezes: 48,
      parcelasPagas: 10,
      parcelasAtrasadas: 4,
      debitos: 0,
    })
    assert.equal(r.pagarSugerido, semDebito.pagarSugerido)
  })

  it('com bastante parcela paga sugere perto de 20%', () => {
    const r = calcProposta({
      fipe: 80000,
      valorParcela: 800,
      quantasVezes: 24,
      parcelasPagas: 18,
      parcelasAtrasadas: 1,
      debitos: 0,
    })
    assert.equal(r.acimaFipe, false)
    assert.ok(r.percentualSugerido >= 15)
    assert.ok(r.percentualSugerido <= 20)
  })
})

describe('extract from annotations', () => {
  it('lê FIPE e financiamento no texto da ficha', () => {
    const notes = extractFromAnnotationText(`
Valor FIPE: R$ 52.000,00
Parcela: R$ 1.250,00
Quantas vezes: 48
Parcelas pagas: 12
Parcelas atrasadas: 3
Valor débito: R$ 1.800,00
`)
    assert.equal(notes.fipe, 52000)
    assert.equal(notes.valorParcela, 1250)
    assert.equal(notes.quantasVezes, 48)
    assert.equal(notes.parcelasPagas, 12)
    assert.equal(notes.parcelasAtrasadas, 3)
    assert.equal(notes.debitos, 1800)
  })

  it('usa FIPE digitada e cai nas anotações se a ficha estiver vazia', () => {
    const input = extractPropostaInput(
      {
        annotations: [
          {
            title: 'Tabela FIPE',
            body: 'Valor FIPE: R$ 40.000,00',
          },
          {
            title: 'Resumo do veículo',
            body: 'Parcelas pagas: 10\nParcelas atrasadas: 2',
          },
        ],
      },
      {
        valor_fipe: '35000',
        valor_parcela: '900',
        quantas_vezes: '36',
      },
    )
    assert.equal(input.fipe, 35000)
    assert.equal(input.valorParcela, 900)
    assert.equal(input.quantasVezes, 36)
    assert.equal(input.parcelasPagas, 10)
    assert.equal(input.parcelasAtrasadas, 2)
  })
})
