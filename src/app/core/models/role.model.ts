export type UserRole =
  | 'founder'
  | 'cofounder'
  | 'finance-manager'
  | 'operations-manager'
  | 'hr-manager'
  | 'team-member'
  | 'mentor'
  | 'auditor'
  | 'ca'
  | 'investor';

export type Permission =
  | 'manageCompany'
  | 'manageMembers'
  | 'inviteMembers'
  | 'manageRoles'
  | 'manageFunding'
  | 'manageExpenses'
  | 'manageTeamPayments'
  | 'manageStartupCosts'
  | 'manageRecurringCosts'
  | 'manageFounderNotes'
  | 'viewReports'
  | 'exportReports'
  | 'readOnly';

export type PermissionOverrides = Partial<Record<Permission, boolean>>;

export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  founder: 'Founder / Super Admin',
  cofounder: 'Co-Founder',
  'finance-manager': 'Finance Manager',
  'operations-manager': 'Operations Manager',
  'hr-manager': 'HR Manager',
  'team-member': 'Team Member',
  mentor: 'Mentor',
  auditor: 'Auditor',
  ca: 'Chartered Accountant',
  investor: 'Investor / Viewer',
};

export const ROLE_OPTIONS: UserRole[] = [
  'founder',
  'cofounder',
  'finance-manager',
  'operations-manager',
  'hr-manager',
  'team-member',
  'mentor',
  'auditor',
  'ca',
  'investor',
];

export const INVITABLE_ROLES: UserRole[] = ROLE_OPTIONS.filter((role) => role !== 'founder');

export const PERMISSIONS: Permission[] = [
  'manageCompany',
  'manageMembers',
  'inviteMembers',
  'manageRoles',
  'manageFunding',
  'manageExpenses',
  'manageTeamPayments',
  'manageStartupCosts',
  'manageRecurringCosts',
  'manageFounderNotes',
  'viewReports',
  'exportReports',
  'readOnly',
];

export const ADMIN_PERMISSIONS: Permission[] = [
  'manageCompany',
  'manageMembers',
  'inviteMembers',
  'manageRoles',
];

export const ROLE_PERMISSIONS: Record<UserRole, Record<Permission, boolean>> = {
  founder: allPermissions(true),
  cofounder: {
    ...allPermissions(true),
    manageRoles: true,
  },
  'finance-manager': permissionSet([
    'manageFunding',
    'manageExpenses',
    'manageStartupCosts',
    'manageRecurringCosts',
    'manageTeamPayments',
    'viewReports',
    'exportReports',
  ]),
  'operations-manager': permissionSet([
    'manageExpenses',
    'manageRecurringCosts',
    'manageFounderNotes',
    'viewReports',
  ]),
  'hr-manager': permissionSet([
    'manageTeamPayments',
    'viewReports',
  ]),
  'team-member': permissionSet(['readOnly']),
  mentor: permissionSet(['readOnly', 'viewReports']),
  auditor: permissionSet(['readOnly', 'viewReports', 'exportReports']),
  ca: permissionSet(['readOnly', 'viewReports', 'exportReports']),
  investor: permissionSet(['readOnly', 'viewReports']),
};

export function roleDisplayName(role: UserRole | null | undefined): string {
  return role ? ROLE_DISPLAY_NAMES[role] : 'No role assigned';
}

export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  return role ? Boolean(ROLE_PERMISSIONS[role]?.[permission]) : false;
}

export function effectivePermissions(
  role: UserRole | null | undefined,
  overrides: PermissionOverrides | null | undefined,
): Record<Permission, boolean> | null {
  if (!role) {
    return null;
  }

  const permissions = {
    ...ROLE_PERMISSIONS[role],
    ...(overrides ?? {}),
  };

  permissions.readOnly = true;
  return permissions;
}

function allPermissions(value: boolean): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSIONS.map((permission) => [permission, value])) as Record<Permission, boolean>;
}

function permissionSet(enabled: Permission[]): Record<Permission, boolean> {
  const permissions = allPermissions(false);
  permissions.readOnly = true;
  enabled.forEach((permission) => {
    permissions[permission] = true;
  });
  return permissions;
}
