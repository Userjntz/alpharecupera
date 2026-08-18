import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Loader2, RefreshCw, Search, Shield, UserPlus } from 'lucide-react'
import type { Permission, UserRole } from '../lib/roles'
import {
  ROLE_LABELS,
  ROLE_OPTIONS,
  assignableRolesFor,
  hasPermission,
  normalizePermissionExtras,
  normalizeRole,
  permissionLabel,
  roleDescription,
  PERMISSION_CATEGORIES,
} from '../lib/roles'
import {
  type AdminUser,
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchTeams,
  patchAdminUser,
  revokeUserSessions,
} from '../lib/adminApi'
import { ExtrasPicker } from './ExtrasPicker'
import { CampaignLink } from './CampaignLink'
import { slugFromUserName } from '@shared/captadorCampaign'

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    })
  } catch {
    return iso
  }
}

export function UsersAdmin({
  role,
  extras = [],
  currentUserId,
}: {
  role: UserRole
  extras?: Permission[]
  currentUserId: string
}) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [items, setItems] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('captador')
  const [teamId, setTeamId] = useState('')
  const [createExtras, setCreateExtras] = useState<Permission[]>([])
  const [createSlug, setCreateSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('captador')
  const [editTeamId, setEditTeamId] = useState('')
  const [editExtras, setEditExtras] = useState<Permission[]>([])
  const [editSlug, setEditSlug] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyId, setBusyId] = useState('')

  const canCreate = hasPermission(role, 'users.invite', extras)
  const canEdit = hasPermission(role, 'users.edit', extras)
  const canSuspend = hasPermission(role, 'users.suspend', extras)
  const canAssign = hasPermission(role, 'roles.assign', extras)
  const assignable = useMemo(() => assignableRolesFor(role), [role])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: '20',
      }
      if (q) params.q = q
      if (status) params.status = status
      const [users, t] = await Promise.all([
        fetchAdminUsers(params),
        hasPermission(role, 'teams.view', extras)
          ? fetchTeams()
          : Promise.resolve({ teams: [] }),
      ])
      setItems(users.items || [])
      setTotal(users.total || 0)
      setTeams(t.teams || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [page, q, status, role, extras])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = (u: AdminUser) => {
    const r = normalizeRole(u.role)
    setEditing(u)
    setEditRole(r)
    setEditTeamId(u.teamId || '')
    setEditExtras(normalizePermissionExtras(r, u.permissionExtras || []))
    setEditSlug(u.slug || slugFromUserName(u.name))
    setError('')
    setSuccess('')
  }

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSuccess('')
    try {
      await createAdminUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role: userRole,
        teamId: teamId || null,
        permissionExtras: normalizePermissionExtras(userRole, createExtras),
        slug: createSlug.trim() || undefined,
      })
      setSuccess(`Usuário ${email.trim()} criado. Já pode entrar no painel.`)
      setName('')
      setEmail('')
      setPassword('')
      setTeamId('')
      setCreateExtras([])
      setCreateSlug('')
      setCreateOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário')
    } finally {
      setCreating(false)
    }
  }

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSavingEdit(true)
    setError('')
    setSuccess('')
    try {
      const patch: Record<string, unknown> = {
        teamId: editTeamId || null,
        permissionExtras: normalizePermissionExtras(editRole, editExtras),
        slug: editSlug.trim(),
      }
      if (canAssign) patch.role = editRole
      await patchAdminUser(editing.id, patch)
      setSuccess(`Permissões de ${editing.name} atualizadas.`)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSavingEdit(false)
    }
  }

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na ação')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-[#fff8ef] px-4 py-3 text-sm">
        <p className="font-bold">Link de campanha por captador</p>
        <p className="text-muted mt-1">
          Quiz sem parâmetro vai para o João:{' '}
          <span className="font-semibold text-foreground">
            alpharecupera.com.br
          </span>
          . Para os outros, use{' '}
          <span className="font-semibold text-foreground">
            alpharecupera.com.br/?c=nome
          </span>
          .
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar usuário…"
            className="w-full rounded-xl border-2 border-line pl-9 pr-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1)
            setStatus(e.target.value)
          }}
          className="rounded-xl border-2 border-line px-3 py-2 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="SUSPENDED">Suspenso</option>
          <option value="ARCHIVED">Arquivado</option>
        </select>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setCreateOpen((v) => !v)
              setEditing(null)
            }}
            className="btn-brand inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"
          >
            <UserPlus className="w-4 h-4" />
            Novo usuário
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-line text-sm font-semibold hover:bg-soft"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {createOpen && canCreate && (
        <form
          onSubmit={(e) => void submitCreate(e)}
          className="rounded-2xl bg-white border border-line p-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div>
            <label className="block text-sm font-semibold mb-1">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Senha</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2"
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Cargo base</label>
            <select
              value={userRole}
              onChange={(e) => {
                const r = e.target.value as UserRole
                setUserRole(r)
                setCreateExtras((prev) =>
                  normalizePermissionExtras(r, prev),
                )
              }}
              className="w-full rounded-xl border-2 border-line px-3 py-2 bg-white"
            >
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Código da campanha (?c=)
            </label>
            <input
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder={slugFromUserName(name) || 'ex.: maria'}
              className="w-full rounded-xl border-2 border-line px-3 py-2"
            />
            <p className="text-[11px] text-muted mt-1">
              João não precisa de parâmetro. Os outros: ?c=esse-código
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold mb-1">Equipe</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2 bg-white"
            >
              <option value="">Sem equipe</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 border-t border-line pt-3">
            <ExtrasPicker
              role={userRole}
              value={createExtras}
              onChange={setCreateExtras}
              actorRole={role}
              actorExtras={extras}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="btn-brand rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-70 inline-flex items-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar usuário
            </button>
          </div>
        </form>
      )}

      {editing && canEdit && (
        <form
          onSubmit={(e) => void submitEdit(e)}
          className="rounded-2xl bg-white border border-line p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold">Editar {editing.name}</h3>
              <p className="text-xs text-muted font-medium">{editing.email}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs font-bold px-2 py-1 rounded-lg border border-line hover:bg-soft"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold mb-1">
                Cargo base
              </label>
              <select
                value={editRole}
                disabled={!canAssign}
                onChange={(e) => {
                  const r = e.target.value as UserRole
                  setEditRole(r)
                  setEditExtras((prev) => normalizePermissionExtras(r, prev))
                }}
                className="w-full rounded-xl border-2 border-line px-3 py-2 bg-white disabled:opacity-60"
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Equipe</label>
              <select
                value={editTeamId}
                onChange={(e) => setEditTeamId(e.target.value)}
                className="w-full rounded-xl border-2 border-line px-3 py-2 bg-white"
              >
                <option value="">Sem equipe</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Código da campanha (?c=)
            </label>
            <input
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              className="w-full rounded-xl border-2 border-line px-3 py-2"
            />
            {editSlug.trim() ? (
              <div className="mt-2">
                <CampaignLink slug={editSlug} />
              </div>
            ) : null}
          </div>
          <ExtrasPicker
            role={editRole}
            value={editExtras}
            onChange={setEditExtras}
            actorRole={role}
            actorExtras={extras}
          />
          <button
            type="submit"
            disabled={savingEdit}
            className="btn-brand rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-70 inline-flex items-center gap-2"
          >
            {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar funções
          </button>
        </form>
      )}

      {success && (
        <div className="rounded-2xl bg-green-50 text-ok px-4 py-3 text-sm font-semibold">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-red-50 text-bad px-4 py-3 text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted">Carregando usuários…</p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-white border border-dashed border-[#d4d4d8] p-10 text-center">
          <p className="text-lg font-bold">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#fff8ef] text-left">
              <tr>
                <th className="px-4 py-3 font-bold">Nome</th>
                <th className="px-4 py-3 font-bold hidden md:table-cell">
                  Cargo / extras
                </th>
                <th className="px-4 py-3 font-bold hidden lg:table-cell">
                  Equipe
                </th>
                <th className="px-4 py-3 font-bold hidden md:table-cell">
                  Campanha
                </th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold hidden sm:table-cell">
                  Última atividade
                </th>
                <th className="px-4 py-3 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const uExtras = u.permissionExtras || []
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-bold">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="font-semibold">
                        {ROLE_LABELS[normalizeRole(u.role)] || u.role}
                      </p>
                      {uExtras.length > 0 && (
                        <p className="text-[11px] text-muted mt-0.5">
                          +{uExtras.length} extra
                          {uExtras.length > 1 ? 's' : ''}:{' '}
                          {uExtras
                            .slice(0, 3)
                            .map((p) => permissionLabel(p))
                            .join(', ')}
                          {uExtras.length > 3 ? '…' : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {u.teamName || '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <CampaignLink
                        slug={u.slug || slugFromUserName(u.name)}
                        compact
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wide">
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted">
                      {fmtDate(u.last_activity_at || u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== currentUserId && (
                        <div className="flex flex-wrap gap-1">
                          {canEdit && u.status !== 'ARCHIVED' && (
                            <button
                              type="button"
                              className="text-xs font-bold px-2 py-1 rounded-lg border border-line hover:bg-soft"
                              onClick={() => openEdit(u)}
                            >
                              Funções
                            </button>
                          )}
                          {canSuspend && u.status === 'ACTIVE' && (
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              className="text-xs font-bold px-2 py-1 rounded-lg border border-line hover:bg-soft disabled:opacity-50"
                              onClick={() =>
                                void runAction(u.id, () =>
                                  patchAdminUser(u.id, {
                                    status: 'SUSPENDED',
                                  }),
                                )
                              }
                            >
                              Suspender
                            </button>
                          )}
                          {canSuspend && u.status === 'SUSPENDED' && (
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              className="text-xs font-bold px-2 py-1 rounded-lg border border-line hover:bg-soft disabled:opacity-50"
                              onClick={() =>
                                void runAction(u.id, () =>
                                  patchAdminUser(u.id, { status: 'ACTIVE' }),
                                )
                              }
                            >
                              Reativar
                            </button>
                          )}
                          {canSuspend && u.status !== 'ARCHIVED' && (
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              className="text-xs font-bold px-2 py-1 rounded-lg border border-red-200 text-bad hover:bg-red-50 disabled:opacity-50"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Excluir (arquivar) ${u.name}? A conta perde o acesso. Histórico é preservado.`,
                                  )
                                ) {
                                  void runAction(u.id, () =>
                                    deleteAdminUser(u.id),
                                  )
                                }
                              }}
                            >
                              Excluir
                            </button>
                          )}
                          {hasPermission(
                            role,
                            'users.sessions.revoke',
                            extras,
                          ) &&
                            u.status !== 'ARCHIVED' && (
                              <button
                                type="button"
                                disabled={busyId === u.id}
                                className="text-xs font-bold px-2 py-1 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Revogar todas as sessões de ${u.name}?`,
                                    )
                                  ) {
                                    void runAction(u.id, () =>
                                      revokeUserSessions(u.id),
                                    )
                                  }
                                }}
                              >
                                Revogar sessões
                              </button>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-line flex justify-between text-xs font-semibold text-muted">
            <span>
              {total} usuário(s) · página {page}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={items.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPermission(role, 'roles.view', extras) && (
        <section className="rounded-2xl bg-white border border-line p-5">
          <h3 className="font-extrabold mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Matriz de cargos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ROLE_OPTIONS.map((r) => (
              <div key={r} className="border border-line rounded-xl p-3">
                <p className="font-bold">{ROLE_LABELS[r]}</p>
                <p className="text-xs text-muted mt-1">{roleDescription(r)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {PERMISSION_CATEGORIES.map((cat) => (
              <details
                key={cat.id}
                className="border border-line rounded-xl p-3"
              >
                <summary className="font-bold text-sm cursor-pointer">
                  {cat.label}
                </summary>
                <ul className="mt-2 text-xs text-muted space-y-1">
                  {cat.permissions.map((p) => (
                    <li key={p}>{permissionLabel(p)}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
