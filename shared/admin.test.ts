import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canAssignRole,
  canGrantPermissions,
  canSuspendOrArchiveUser,
  countActiveOwners,
  hasPermission,
  normalizeRole,
  permissionsForRole,
  sanitizeAuditMeta,
  canAccessSection,
  normalizePermissionExtras,
  sectionsUnlockedByExtras,
} from './admin.ts'

describe('normalizeRole', () => {
  it('mapeia legado funcionario e owner', () => {
    assert.equal(normalizeRole('funcionario'), 'captador')
    assert.equal(normalizeRole('owner'), 'admin')
    assert.equal(normalizeRole('desconhecido'), 'captador')
  })
})

describe('permissões por cargo', () => {
  it('admin tem todas as permissões críticas', () => {
    assert.equal(hasPermission('admin', 'settings.security'), true)
    assert.equal(hasPermission('admin', 'users.invite'), true)
    assert.equal(hasPermission('auditor', 'users.invite'), false)
    assert.equal(hasPermission('marketing', 'finance.view_details'), false)
  })

  it('marketing não acessa operação de veículos', () => {
    assert.equal(hasPermission('marketing', 'admin.dashboard.view'), false)
    assert.equal(hasPermission('marketing', 'vehicles.view'), false)
    assert.equal(hasPermission('marketing', 'leads.view'), false)
    assert.equal(canAccessSection('marketing', 'dashboard'), false)
    assert.equal(canAccessSection('marketing', 'veiculos'), false)
    assert.equal(canAccessSection('marketing', 'leads'), false)
    assert.equal(canAccessSection('marketing', 'marketing'), true)
  })

  it('auditor não exporta nem edita', () => {
    assert.equal(hasPermission('auditor', 'audit.view'), true)
    assert.equal(hasPermission('auditor', 'leads.edit'), false)
    assert.equal(hasPermission('auditor', 'reports.export'), false)
  })

  it('extras só ampliam se listados', () => {
    assert.equal(
      hasPermission('vendedor', 'finance.view_details', ['finance.view_details']),
      true,
    )
  })
})

describe('atribuição de cargos', () => {
  it('gerente não promove a admin', () => {
    assert.equal(canAssignRole('gerente', 'admin'), false)
    assert.equal(canAssignRole('gerente', 'captador'), true)
    assert.equal(canAssignRole('admin', 'admin'), true)
  })

  it('impede conceder permissão superior à própria', () => {
    const actorPerms = permissionsForRole('gerente')
    assert.equal(
      canGrantPermissions('gerente', [], ['settings.security']),
      false,
    )
    assert.equal(
      canGrantPermissions('gerente', [], ['users.invite']),
      actorPerms.includes('users.invite'),
    )
  })
})

describe('último owner', () => {
  it('conta owners ativos', () => {
    assert.equal(
      countActiveOwners([
        { role: 'admin', active: true },
        { role: 'admin', status: 'SUSPENDED' },
        { role: 'gerente', active: true },
      ]),
      1,
    )
  })

  it('bloqueia suspender o último owner', () => {
    const users = [{ role: 'admin', active: true }]
    const result = canSuspendOrArchiveUser(
      'admin',
      { id: 'u1', role: 'admin', active: true },
      'actor',
      users,
    )
    assert.equal(result.ok, false)
  })

  it('bloqueia auto-suspensão', () => {
    const result = canSuspendOrArchiveUser(
      'admin',
      { id: 'me', role: 'captador' },
      'me',
      [{ role: 'admin' }],
    )
    assert.equal(result.ok, false)
  })
})

describe('auditoria sanitizada', () => {
  it('remove campos sensíveis', () => {
    const clean = sanitizeAuditMeta({
      email: 'a@b.com',
      password: 'secret',
      token_hash: 'abc',
      role: 'admin',
    })
    assert.equal(clean?.email, 'a@b.com')
    assert.equal(clean?.role, 'admin')
    assert.equal(clean?.password, undefined)
    assert.equal(clean?.token_hash, undefined)
  })
})

describe('seções', () => {
  it('marketing acessa marketing e não usuários', () => {
    assert.equal(canAccessSection('marketing', 'marketing'), true)
    assert.equal(canAccessSection('marketing', 'usuarios'), false)
  })

  it('captador acessa Prompt, Puxador FIPE e Contrato', () => {
    assert.equal(canAccessSection('captador', 'prompt'), true)
    assert.equal(canAccessSection('captador', 'puxador'), true)
    assert.equal(canAccessSection('captador', 'contrato'), true)
    assert.equal(canAccessSection('captador', 'leads'), true)
    assert.equal(canAccessSection('captador', 'usuarios'), false)
  })

  it('extras misturam funções sem trocar o cargo', () => {
    assert.equal(canAccessSection('captador', 'marketing'), false)
    assert.equal(
      canAccessSection('captador', 'marketing', ['marketing.view']),
      true,
    )
    assert.equal(
      hasPermission('captador', 'marketing.publish', [
        'marketing.view',
        'marketing.publish',
      ]),
      true,
    )
    assert.deepEqual(
      sectionsUnlockedByExtras('captador', ['marketing.view']),
      ['marketing'],
    )
    assert.deepEqual(
      normalizePermissionExtras('captador', [
        'leads.view',
        'marketing.view',
        'marketing.view',
      ]),
      ['marketing.view'],
    )
  })
})
