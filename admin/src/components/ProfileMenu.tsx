import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import type { AuthUser } from '../lib/api'
import { ROLE_LABELS, normalizeRole } from '../lib/roles'

export function ProfileMenu({
  user,
  onOpenProfile,
  onLogout,
}: {
  user: AuthUser
  onOpenProfile: () => void
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const role = normalizeRole(user.role)
  const initials = (user.name || user.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2.5 rounded-2xl border border-line bg-white pl-2 pr-3 py-1.5 hover:bg-soft transition-colors"
      >
        <span className="w-9 h-9 rounded-xl btn-brand shadow-none flex items-center justify-center text-sm font-extrabold">
          {initials || <UserRound className="w-4 h-4" />}
        </span>
        <span className="text-left min-w-0 hidden sm:block">
          <span className="block text-sm font-bold truncate max-w-[140px]">
            {user.name || 'Usuário'}
          </span>
          <span className="block text-[11px] font-semibold text-muted truncate max-w-[140px]">
            {ROLE_LABELS[role]}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-white shadow-[0_16px_40px_rgba(0,0,0,0.08)] z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="font-extrabold truncate">{user.name || 'Usuário'}</p>
            <p className="text-xs text-muted truncate">{user.email}</p>
            <p className="mt-1.5 inline-flex text-[10px] font-bold uppercase tracking-wide text-brand bg-soft px-2 py-1 rounded-lg">
              {ROLE_LABELS[role]}
            </p>
          </div>
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenProfile()
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[#374151] hover:bg-soft text-left"
            >
              <Settings className="w-4 h-4 text-brand" />
              Perfil e configurações
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-bad hover:bg-red-50 text-left"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
