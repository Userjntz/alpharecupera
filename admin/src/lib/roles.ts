export type {
  UserRole,
  Permission,
  AccountStatus,
} from '@shared/admin'

export type { AdminSection as Section } from '@shared/admin'

export {
  ROLE_LABELS,
  ALL_ROLES,
  normalizeRole,
  sectionsForRole,
  canAccessSection,
  defaultSectionForRole,
  workspaceLabel,
  roleDescription,
  hasPermission,
  canAssignRole,
  canGrantPermissions,
  permissionsForRole,
  normalizePermissionExtras,
  sectionsUnlockedByExtras,
  permissionLabel,
  PERMISSION_CATEGORIES,
  LEAD_PIPELINE_STAGES,
} from '@shared/admin'

import {
  ALL_ROLES,
  canAssignRole,
  hasPermission,
  normalizeRole,
  type Permission,
  type UserRole,
} from '@shared/admin'

export const ROLE_OPTIONS: UserRole[] = [...ALL_ROLES]

/** Quem gerencia contas (lista/convite) */
export function canManageTeam(role: UserRole, extras: Permission[] = []) {
  return hasPermission(normalizeRole(role), 'users.view', extras)
}

export function canManageMarketingConnection(
  role: UserRole,
  extras: Permission[] = [],
) {
  return hasPermission(normalizeRole(role), 'marketing.manage', extras)
}

export function canAccessMarketing(role: UserRole, extras: Permission[] = []) {
  return hasPermission(normalizeRole(role), 'marketing.view', extras)
}

export function canInvite(role: UserRole, extras: Permission[] = []) {
  return hasPermission(normalizeRole(role), 'users.invite', extras)
}

export function assignableRolesFor(actor: UserRole): UserRole[] {
  return ALL_ROLES.filter((r) => canAssignRole(actor, r))
}
