import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canTransition,
  distributeSchedule,
  nextBackoffMs,
  validateCaption,
  validateFormatMedia,
  zonedLocalToUtcIso,
  formatInTimeZone,
  isRetryableProviderError,
  CAPTION_MAX,
} from '../shared/marketing.ts'

describe('máquina de estados', () => {
  it('permite DRAFT -> SCHEDULED e bloqueia PUBLISHED -> DRAFT', () => {
    assert.equal(canTransition('DRAFT', 'SCHEDULED'), true)
    assert.equal(canTransition('PUBLISHED', 'DRAFT'), false)
    assert.equal(canTransition('FAILED_RETRYABLE', 'QUEUED'), true)
  })
})

describe('timezone', () => {
  it('converte America/Sao_Paulo para UTC', () => {
    const utc = zonedLocalToUtcIso('2026-08-10T09:00', 'America/Sao_Paulo')
    assert.equal(utc, '2026-08-10T12:00:00.000Z')
    assert.equal(formatInTimeZone(utc, 'America/Sao_Paulo'), '2026-08-10T09:00')
  })
})

describe('distribuição automática', () => {
  it('gera horários com intervalo fixo sem conflito', () => {
    const schedule = distributeSchedule(
      3,
      {
        mode: 'fixed_interval',
        days: [1, 2, 3, 4, 5],
        windowStart: '09:00',
        windowEnd: '20:00',
        includeWeekends: false,
        intervalMinutes: 120,
        timezone: 'America/Sao_Paulo',
      },
      [],
      '2026-12-14', // segunda-feira futura
    )
    assert.equal(schedule.length, 3)
    const locals = schedule.map((s) => formatInTimeZone(s, 'America/Sao_Paulo'))
    assert.deepEqual(new Set(locals).size, 3)
  })

  it('respeita slots personalizados', () => {
    const schedule = distributeSchedule(
      2,
      {
        mode: 'custom_slots',
        days: [1],
        windowStart: '09:00',
        windowEnd: '20:00',
        includeWeekends: false,
        customSlots: ['09:00', '13:00'],
        timezone: 'America/Sao_Paulo',
      },
      [],
      '2026-12-14',
    )
    const locals = schedule.map((s) => formatInTimeZone(s, 'America/Sao_Paulo'))
    assert.ok(locals[0].endsWith('T09:00'))
    assert.ok(locals[1].endsWith('T13:00'))
  })

  it('falha em conflito manual', () => {
    assert.throws(() =>
      distributeSchedule(
        2,
        {
          mode: 'manual',
          days: [1],
          windowStart: '09:00',
          windowEnd: '20:00',
          includeWeekends: true,
          timezone: 'America/Sao_Paulo',
          manualTimes: ['2026-08-10T10:00', '2026-08-10T10:00'],
        },
        [],
      ),
    )
  })
})

describe('validações', () => {
  it('rejeita legenda acima do limite', () => {
    const errors = validateCaption('x'.repeat(CAPTION_MAX), '#tag')
    assert.ok(errors.length > 0)
  })

  it('valida carrossel e feed image', () => {
    assert.ok(
      validateFormatMedia('FEED_IMAGE', [
        { kind: 'image', mime: 'image/jpeg', size: 1000 },
      ]).length === 0,
    )
    assert.ok(
      validateFormatMedia('CAROUSEL', [
        { kind: 'image', mime: 'image/jpeg', size: 1000 },
      ]).length > 0,
    )
  })
})

describe('erros e backoff', () => {
  it('classifica rate limit como recuperável', () => {
    assert.equal(isRetryableProviderError('4'), true)
    assert.equal(isRetryableProviderError('RATE_LIMIT'), true)
  })

  it('backoff cresce com tentativas', () => {
    const a = nextBackoffMs(1)
    const b = nextBackoffMs(4)
    assert.ok(b > a)
  })
})
