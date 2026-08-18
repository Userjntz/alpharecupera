import { useMemo } from 'react'
import type { Permission, UserRole } from '../lib/roles'
import {
  PERMISSION_CATEGORIES,
  canGrantPermissions,
  normalizePermissionExtras,
  permissionLabel,
  permissionsForRole,
} from '../lib/roles'

/** Checkboxes para misturar funções (extras além do cargo). */
export function ExtrasPicker({
  role,
  value,
  onChange,
  actorRole,
  actorExtras = [],
}: {
  role: UserRole
  value: Permission[]
  onChange: (next: Permission[]) => void
  actorRole: UserRole
  actorExtras?: Permission[]
}) {
  const base = useMemo(() => new Set(permissionsForRole(role)), [role])
  const selected = useMemo(
    () => new Set(normalizePermissionExtras(role, value)),
    [role, value],
  )

  const toggle = (perm: Permission) => {
    const next = new Set(selected)
    if (next.has(perm)) next.delete(perm)
    else next.add(perm)
    onChange(normalizePermissionExtras(role, [...next]))
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold">Funções extras</p>
        <p className="text-xs text-muted font-medium mt-0.5">
          Marque o que esse usuário pode fazer além do cargo. Ex.: captador +
          marketing.
        </p>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {PERMISSION_CATEGORIES.map((cat) => {
          const perms = cat.permissions.filter((p) => !base.has(p))
          if (perms.length === 0) return null
          return (
            <details
              key={cat.id}
              className="rounded-xl border border-line bg-[#fffaf3] open:bg-white"
              open={cat.id === 'marketing' || cat.id === 'ops'}
            >
              <summary className="px-3 py-2 text-sm font-bold cursor-pointer">
                {cat.label}
              </summary>
              <ul className="px-3 pb-3 space-y-1.5">
                {perms.map((p) => {
                  const grantable = canGrantPermissions(
                    actorRole,
                    actorExtras,
                    [p],
                  )
                  return (
                    <li key={p}>
                      <label
                        className={`flex items-start gap-2 text-sm ${
                          grantable ? 'cursor-pointer' : 'opacity-40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.has(p)}
                          disabled={!grantable}
                          onChange={() => toggle(p)}
                        />
                        <span>
                          <span className="font-semibold">
                            {permissionLabel(p)}
                          </span>
                          <span className="block text-[11px] text-muted font-medium">
                            {p}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </details>
          )
        })}
      </div>
      {selected.size > 0 && (
        <p className="text-xs font-semibold text-brand">
          {selected.size} função(ões) extra(s) selecionada(s)
        </p>
      )}
    </div>
  )
}
