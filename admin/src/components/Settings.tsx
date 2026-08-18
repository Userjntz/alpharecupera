import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUser,
  type AuthUser,
  type UserRole,
} from '../lib/api'
import {
  ROLE_LABELS,
  assignableRolesFor,
  canManageTeam,
  normalizeRole,
  roleDescription,
} from '../lib/roles'

export function Settings({
  user,
  onUserUpdated,
}: {
  user: AuthUser
  onUserUpdated: (user: AuthUser) => void
}) {
  const role = normalizeRole(user.role)
  const canManage = canManageTeam(role)
  const [name, setName] = useState(user.name || '')
  const [password, setPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')

  const [team, setTeam] = useState<AuthUser[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamErr, setTeamErr] = useState('')

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('captador')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const assignableRoles = assignableRolesFor(role)

  const loadTeam = async () => {
    if (!canManage) return
    setTeamLoading(true)
    setTeamErr('')
    try {
      setTeam(await fetchUsers())
    } catch (e) {
      setTeamErr(e instanceof Error ? e.message : 'Falha ao carregar equipe')
    } finally {
      setTeamLoading(false)
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [canManage])

  useEffect(() => {
    setName(user.name || '')
  }, [user.name])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg('')
    setProfileErr('')
    try {
      const patch: { name?: string; password?: string } = {
        name: name.trim(),
      }
      if (password) patch.password = password
      const updated = await updateUser(user.id, patch)
      onUserUpdated(updated)
      setPassword('')
      setProfileMsg('Dados salvos com sucesso.')
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setSavingProfile(false)
    }
  }

  const addMember = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateErr('')
    try {
      await createUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('captador')
      await loadTeam()
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Falha ao criar conta')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (member: AuthUser) => {
    if (member.id === user.id) return
    try {
      await updateUser(member.id, { active: !member.active })
      await loadTeam()
    } catch (err) {
      setTeamErr(err instanceof Error ? err.message : 'Falha ao atualizar')
    }
  }

  const removeMember = async (member: AuthUser) => {
    if (member.id === user.id) return
    if (!window.confirm(`Remover a conta de ${member.name}?`)) return
    try {
      await deleteUser(member.id)
      await loadTeam()
    } catch (err) {
      setTeamErr(err instanceof Error ? err.message : 'Falha ao remover')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="rounded-2xl bg-white border border-line p-6 space-y-4">
        <div>
          <h2 className="text-lg font-extrabold">Meu perfil</h2>
          <p className="text-sm text-muted font-medium mt-1">
            {ROLE_LABELS[role]} — {roleDescription(role)}
          </p>
        </div>

        <form onSubmit={(e) => void saveProfile(e)} className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">E-mail</label>
            <input
              value={user.email}
              disabled
              className="w-full rounded-xl border-2 border-line px-4 py-2.5 bg-[#fafafa] text-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Perfil</label>
            <input
              value={ROLE_LABELS[role]}
              disabled
              className="w-full rounded-xl border-2 border-line px-4 py-2.5 bg-[#fafafa] text-muted"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Nova senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Deixe em branco para manter"
              minLength={6}
              className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand"
            />
          </div>

          {profileMsg && (
            <p className="text-sm font-semibold text-ok">{profileMsg}</p>
          )}
          {profileErr && (
            <p className="text-sm font-semibold text-bad">{profileErr}</p>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-70"
          >
            {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </button>
        </form>
      </section>

      {canManage && (
        <>
          <section className="rounded-2xl bg-white border border-line p-6 space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">Nova conta</h2>
              <p className="text-sm text-muted font-medium mt-1">
                Preferencialmente use Usuários → Convidar (sem senha em
                texto). Aqui ainda é possível criar conta direta.
              </p>
            </div>

            <form
              onSubmit={(e) => void addMember(e)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-1">Nome</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">E-mail</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold mb-1">Perfil</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border-2 border-line px-4 py-2.5 outline-none focus:border-brand bg-white"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted mt-1.5">
                  {roleDescription(newRole)}
                </p>
              </div>

              {createErr && (
                <p className="sm:col-span-2 text-sm font-semibold text-bad">
                  {createErr}
                </p>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="btn-brand inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-70"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Criar conta
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl bg-white border border-line p-6 space-y-4">
            <div>
              <h2 className="text-lg font-extrabold">Equipe</h2>
              <p className="text-sm text-muted font-medium mt-1">
                Contas com acesso ao painel
              </p>
            </div>

            {teamLoading && (
              <p className="text-sm text-muted font-medium">Carregando…</p>
            )}
            {teamErr && (
              <p className="text-sm font-semibold text-bad">{teamErr}</p>
            )}

            <ul className="space-y-2">
              {team.map((member) => {
                const memberRole = normalizeRole(member.role)
                const canEdit = member.id !== user.id && canManage
                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold truncate">{member.name}</p>
                      <p className="text-xs text-muted truncate">{member.email}</p>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-brand mt-1">
                        {ROLE_LABELS[memberRole]}
                        {!member.active ? ' · Inativo' : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleActive(member)}
                          className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold hover:bg-soft"
                        >
                          {member.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeMember(member)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 text-bad px-3 py-1.5 text-xs font-bold hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
