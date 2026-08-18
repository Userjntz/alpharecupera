import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CAPTADOR_SLUG,
  campaignQuizUrl,
  effectiveUserSlug,
  leadVisibleToCaptador,
  parseCaptadorSlugFromSearch,
  reassignQuizCampaignLeads,
  resolveCaptadorAssignee,
  slugFromUserName,
  slugifyCaptador,
  uniqueCaptadorSlug,
  withPersistedCaptadorSlugs,
} from './captadorCampaign.ts'

describe('slug da campanha', () => {
  it('gera joao a partir de João', () => {
    assert.equal(slugifyCaptador('João'), 'joao')
    assert.equal(slugFromUserName('João Silva'), 'joao')
  })

  it('lê ?c= da URL', () => {
    assert.equal(parseCaptadorSlugFromSearch('?c=Maria'), 'maria')
    assert.equal(parseCaptadorSlugFromSearch('captador=pedro'), 'pedro')
    assert.equal(parseCaptadorSlugFromSearch(''), '')
  })

  it('link sem parâmetro é o do João', () => {
    assert.equal(
      campaignQuizUrl('joao'),
      'https://alpharecupera.com.br',
    )
    assert.equal(
      campaignQuizUrl('maria'),
      'https://alpharecupera.com.br/?c=maria',
    )
  })

  it('evita slug duplicado', () => {
    const users = [{ id: '1', name: 'Maria Souza', slug: 'maria' }]
    assert.equal(uniqueCaptadorSlug('maria', users), 'maria-2')
    assert.equal(uniqueCaptadorSlug('maria', users, '1'), 'maria')
  })
})

describe('atribuição de captador', () => {
  const users = [
    { id: 'j', name: 'João', slug: 'joao', status: 'ACTIVE' },
    { id: 'm', name: 'Maria', slug: 'maria', status: 'ACTIVE' },
  ]

  it('sem parâmetro cai no João', () => {
    const r = resolveCaptadorAssignee(users, '')
    assert.equal(r.user?.id, 'j')
    assert.equal(r.slug, DEFAULT_CAPTADOR_SLUG)
  })

  it('?c=maria vai para a Maria', () => {
    const r = resolveCaptadorAssignee(users, 'maria')
    assert.equal(r.user?.id, 'm')
  })

  it('slug desconhecido cai no João', () => {
    const r = resolveCaptadorAssignee(users, 'fulano')
    assert.equal(r.user?.id, 'j')
    assert.equal(r.slug, DEFAULT_CAPTADOR_SLUG)
  })

  it('?c=enzo vai para o Enzo, não para o João', () => {
    const team = [
      { id: 'j', name: 'João Victor', status: 'ACTIVE' },
      { id: 'e', name: 'Enzo Lag', status: 'ACTIVE' },
    ]
    const r = resolveCaptadorAssignee(team, 'enzo')
    assert.equal(r.user?.id, 'e')
    assert.equal(r.slug, 'enzo')
  })

  it('captador só vê os leads dele', () => {
    const maria = users[1]
    assert.equal(
      leadVisibleToCaptador({ assigneeId: 'm', captadorSlug: 'maria' }, maria),
      true,
    )
    assert.equal(
      leadVisibleToCaptador({ assigneeId: 'j', captadorSlug: 'joao' }, maria),
      false,
    )
    assert.equal(
      leadVisibleToCaptador({}, { id: 'j', name: 'João', slug: 'joao' }),
      true,
    )
    assert.equal(
      leadVisibleToCaptador(
        { origem: 'manual', createdById: 'm', captadorSlug: 'maria' },
        maria,
      ),
      true,
    )
  })

  it('usa o slug salvo ou o primeiro nome', () => {
    assert.equal(effectiveUserSlug({ id: '1', name: 'Pedro Lima' }), 'pedro')
    assert.equal(
      effectiveUserSlug({ id: '1', name: 'Pedro Lima', slug: 'pedrao' }),
      'pedrao',
    )
  })

  it('Enzo não vê campanha do João e João não vê a do Enzo', () => {
    const enzo = { id: 'e', name: 'Enzo Lag', slug: 'enzo' }
    const joao = { id: 'j', name: 'João Victor', slug: 'joao' }
    assert.equal(
      leadVisibleToCaptador({ captadorSlug: 'enzo', assigneeId: 'e' }, enzo),
      true,
    )
    assert.equal(
      leadVisibleToCaptador({ captadorSlug: 'enzo', assigneeId: 'e' }, joao),
      false,
    )
    assert.equal(
      leadVisibleToCaptador({ captadorSlug: 'joao', assigneeId: 'j' }, enzo),
      false,
    )
    assert.equal(
      leadVisibleToCaptador({ captadorSlug: 'enzo', assigneeId: 'j' }, joao),
      false,
    )
    assert.equal(
      leadVisibleToCaptador({ captadorSlug: 'enzo', assigneeId: 'j' }, enzo),
      true,
    )
    assert.equal(leadVisibleToCaptador({}, joao), true)
    assert.equal(leadVisibleToCaptador({}, enzo), false)
  })

  it('grava joao/enzo nos ativos mesmo com homônimos arquivados', () => {
    const { users } = withPersistedCaptadorSlugs([
      { id: 'old-e', name: 'Enzo Lang', status: 'ARCHIVED' },
      { id: 'e', name: 'Enzo Lag', status: 'ACTIVE' },
      { id: 'j', name: 'João Victor', status: 'ACTIVE' },
      { id: 'old-j', name: 'João', status: 'ARCHIVED' },
    ])
    assert.equal(users.find((u) => u.id === 'e')?.slug, 'enzo')
    assert.equal(users.find((u) => u.id === 'j')?.slug, 'joao')
  })

  it('quiz sem slug vai para o João; ?c=enzo fica com o Enzo; manual não mexe', () => {
    const team = [
      { id: 'j', name: 'João Victor', slug: 'joao', status: 'ACTIVE' },
      { id: 'e', name: 'Enzo Lag', slug: 'enzo', status: 'ACTIVE' },
    ]
    const { leads, changed } = reassignQuizCampaignLeads(
      [
        { id: '1', origem: 'quiz' },
        { id: '2', origem: 'quiz', captadorSlug: 'enzo' },
        {
          id: '3',
          origem: 'manual',
          createdById: 'e',
          assigneeId: 'e',
          captadorSlug: 'enzo',
        },
      ],
      team,
    )
    assert.equal(changed, true)
    assert.equal(leads[0].captadorSlug, 'joao')
    assert.equal(leads[0].assigneeId, 'j')
    assert.equal(leads[1].captadorSlug, 'enzo')
    assert.equal(leads[1].assigneeId, 'e')
    assert.equal(leads[2].assigneeId, 'e')
    assert.equal(leads[2].origem, 'manual')
  })
})
