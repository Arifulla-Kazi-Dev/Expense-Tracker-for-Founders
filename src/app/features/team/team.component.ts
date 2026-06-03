import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyInvite, CompanyMember } from '../../core/models/company.model';
import {
  ADMIN_PERMISSIONS,
  INVITABLE_ROLES,
  Permission,
  PermissionOverrides,
  ROLE_OPTIONS,
  ROLE_PERMISSIONS,
  UserRole,
  effectivePermissions,
  roleDisplayName,
} from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { InviteService } from '../../core/services/invite.service';
import { MemberService } from '../../core/services/member.service';
import { PermissionService } from '../../core/services/permission.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent, LucideDynamicIcon, ReactiveFormsModule],
  templateUrl: './team.component.html',
})
export class TeamComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly inviteService = inject(InviteService);
  private readonly memberService = inject(MemberService);
  private readonly permissionService = inject(PermissionService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly company = toSignal(this.companyService.activeCompany$, { initialValue: null });
  readonly members = toSignal(this.memberService.members$, { initialValue: [] as CompanyMember[] });
  readonly invites = toSignal(this.inviteService.invites$, { initialValue: [] as CompanyInvite[] });
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly invitableRoles = INVITABLE_ROLES;
  readonly permissionRoles = ROLE_OPTIONS;
  readonly permissionItems = PERMISSION_LABELS;
  readonly permissionGroups = PERMISSION_GROUPS;

  readonly inviteForm = this.formBuilder.nonNullable.group({
    role: ['finance-manager' as UserRole, [Validators.required]],
    expiryDays: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
  });

  errorMessage = '';
  isBusy = false;
  pendingConfirm: TeamConfirmAction | null = null;
  toastMessage = '';

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  canInvite(): boolean {
    return this.permissionService.can('inviteMembers');
  }

  canManage(): boolean {
    return this.permissionService.can('manageMembers');
  }

  canManageRoles(): boolean {
    return this.permissionService.can('manageRoles');
  }

  currentRoleLabel(): string {
    return this.permissionService.roleLabel();
  }

  roleLabel(role: UserRole): string {
    return roleDisplayName(role);
  }

  permissionSummary(role: UserRole): string[] {
    return PERMISSION_LABELS
      .filter((item) => ROLE_PERMISSIONS[role][item.permission])
      .map((item) => item.label);
  }

  permissionDescription(role: UserRole): string {
    const count = this.permissionSummary(role).length;

    if (role === 'founder') {
      return 'Full company ownership and every workspace permission.';
    }

    const writeCount = this.permissionSummary(role).filter((permission) => permission !== 'View everything').length;

    return writeCount > 0
      ? `Can edit ${writeCount} workspace area${writeCount === 1 ? '' : 's'} by default.`
      : 'View-only by default. No edit access unless customized.';
  }

  selectInviteRole(role: UserRole): void {
    this.inviteForm.controls.role.setValue(role);
    this.inviteForm.controls.role.markAsDirty();
  }

  isInviteRoleSelected(role: UserRole): boolean {
    return this.inviteForm.controls.role.value === role;
  }

  roleIcon(role: UserRole): string {
    switch (role) {
      case 'cofounder':
        return 'shield-check';
      case 'finance-manager':
        return 'wallet';
      case 'operations-manager':
        return 'briefcase';
      case 'hr-manager':
        return 'users';
      case 'auditor':
        return 'file-search';
      case 'investor':
        return 'eye';
      default:
        return 'user';
    }
  }

  inviteRoleClass(role: UserRole): string {
    return this.isInviteRoleSelected(role)
      ? 'border-teal-400 bg-teal-50 text-slate-950 ring-2 ring-teal-500/20 dark:border-teal-400/60 dark:bg-teal-400/10 dark:text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900';
  }

  roleHighlights(role: UserRole): string[] {
    return this.permissionSummary(role)
      .filter((permission) => permission !== 'View everything')
      .slice(0, 3);
  }

  inviteLink(invite: CompanyInvite): string {
    return this.inviteService.inviteLink(invite.token);
  }

  whatsAppShareUrl(invite: CompanyInvite): string {
    return this.inviteService.whatsAppShareUrl(invite);
  }

  activeMembers(): number {
    return this.members().filter((member) => member.status === 'active').length;
  }

  pendingInvites(): CompanyInvite[] {
    return this.invites().filter((invite) => invite.status === 'pending');
  }

  async createInvite(): Promise<void> {
    if (this.inviteForm.invalid || this.isBusy || !this.canInvite()) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    this.isBusy = true;
    this.errorMessage = '';

    try {
      const invite = await this.inviteService.createInvite(this.inviteForm.getRawValue());
      await this.copyInvite(invite);
      this.showToast('Invite generated and link copied');
      this.inviteForm.patchValue({
        role: 'finance-manager',
        expiryDays: 7,
      });
      this.inviteForm.markAsPristine();
    } catch (error) {
      this.errorMessage = readableError(error, 'Unable to generate invite.');
    } finally {
      this.isBusy = false;
    }
  }

  async copyInvite(invite: CompanyInvite): Promise<void> {
    const link = this.inviteLink(invite);

    if (this.isBrowser && navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      this.showToast('Invite link copied');
      return;
    }

    this.showToast(link);
  }

  openWhatsApp(invite: CompanyInvite): void {
    if (this.isBrowser) {
      window.open(this.whatsAppShareUrl(invite), '_blank', 'noopener,noreferrer');
    }
  }

  async revokeInvite(invite: CompanyInvite): Promise<void> {
    if (!this.canInvite()) {
      return;
    }

    this.pendingConfirm = {
      title: 'Revoke invite',
      message: `Revoke the ${this.roleLabel(invite.role)} invite link for ${invite.companyName}? The link will stop working immediately.`,
      confirmLabel: 'Revoke invite',
      icon: 'x',
      tone: 'warning',
      action: () => this.inviteService.revokeInvite(invite),
      successMessage: 'Invite revoked',
    };
  }

  async changeRole(member: CompanyMember, event: Event): Promise<void> {
    const role = (event.target as HTMLSelectElement).value as UserRole;

    if (!this.canChangeMember(member) || role === member.role) {
      return;
    }

    await this.runAction(() => this.memberService.changeRole(member.uid, role), 'Member role updated');
  }

  async toggleMemberPermission(member: CompanyMember, permission: Permission): Promise<void> {
    if (!this.canEditPermission(member, permission)) {
      return;
    }

    const defaultValue = Boolean(ROLE_PERMISSIONS[member.role]?.[permission]);
    const nextValue = !this.permissionValue(member, permission);
    const overrides: PermissionOverrides = { ...(member.permissionOverrides ?? {}) };

    if (nextValue === defaultValue) {
      delete overrides[permission];
    } else {
      overrides[permission] = nextValue;
    }

    await this.runAction(
      () => this.memberService.updatePermissionOverrides(member.uid, overrides),
      'Member permission updated',
    );
  }

  async resetMemberPermissions(member: CompanyMember): Promise<void> {
    if (!this.canEditMemberPermissions(member) || !this.hasPermissionOverrides(member)) {
      return;
    }

    await this.runAction(
      () => this.memberService.updatePermissionOverrides(member.uid, {}),
      'Member permissions reset to role defaults',
    );
  }

  async suspend(member: CompanyMember): Promise<void> {
    if (!this.canChangeMember(member)) {
      return;
    }

    this.pendingConfirm = {
      title: 'Suspend member',
      message: `Suspend ${member.name}? They will remain listed but lose active workspace access until restored.`,
      confirmLabel: 'Suspend',
      icon: 'alert-circle',
      tone: 'warning',
      action: () => this.memberService.suspend(member.uid),
      successMessage: 'Member suspended',
    };
  }

  async remove(member: CompanyMember): Promise<void> {
    if (!this.canChangeMember(member)) {
      return;
    }

    this.pendingConfirm = {
      title: 'Remove member',
      message: `Remove ${member.name} from this company workspace? Their member record will be deleted.`,
      confirmLabel: 'Remove',
      icon: 'trash-2',
      tone: 'danger',
      action: () => this.memberService.remove(member.uid, member.role),
      successMessage: 'Member removed',
    };
  }

  canChangeMember(member: CompanyMember): boolean {
    if (!this.canManage() || member.role === 'founder' || member.uid === this.authService.currentUser?.uid) {
      return false;
    }

    if (member.role === 'cofounder') {
      return this.permissionService.currentRole === 'founder';
    }

    return true;
  }

  canEditMemberPermissions(member: CompanyMember): boolean {
    if (!this.canManageRoles() || member.role === 'founder' || member.uid === this.authService.currentUser?.uid) {
      return false;
    }

    if (member.role === 'cofounder') {
      return this.permissionService.currentRole === 'founder';
    }

    return true;
  }

  canEditPermission(member: CompanyMember, permission: Permission): boolean {
    if (permission === 'readOnly' || !this.canEditMemberPermissions(member)) {
      return false;
    }

    if (member.role === 'cofounder' && ADMIN_PERMISSIONS.includes(permission)) {
      return this.permissionService.currentRole === 'founder';
    }

    return true;
  }

  permissionValue(member: CompanyMember, permission: Permission): boolean {
    return Boolean(effectivePermissions(member.role, member.permissionOverrides)?.[permission]);
  }

  memberAccessSummary(member: CompanyMember): string {
    const writePermissions = PERMISSION_LABELS.filter((item) => item.permission !== 'readOnly');
    const enabled = writePermissions.filter((item) => this.permissionValue(member, item.permission)).length;
    const custom = Object.keys(member.permissionOverrides ?? {}).length;

    return `${enabled} edit area${enabled === 1 ? '' : 's'} enabled${custom ? `, ${custom} custom override${custom === 1 ? '' : 's'}` : ''}`;
  }

  permissionItem(permission: Permission): PermissionItem {
    return PERMISSION_LABELS.find((item) => item.permission === permission) ?? {
      permission,
      label: permission,
      detail: 'Workspace access',
    };
  }

  groupEnabledCount(member: CompanyMember, group: PermissionGroup): number {
    return group.permissions.filter((permission) => this.permissionValue(member, permission)).length;
  }

  hasPermissionOverrides(member: CompanyMember): boolean {
    return Object.keys(member.permissionOverrides ?? {}).length > 0;
  }

  isPermissionOverride(member: CompanyMember, permission: Permission): boolean {
    return Object.prototype.hasOwnProperty.call(member.permissionOverrides ?? {}, permission);
  }

  permissionToggleClass(member: CompanyMember, permission: Permission): string {
    if (this.permissionValue(member, permission)) {
      return this.isPermissionOverride(member, permission)
        ? 'border-teal-200 bg-teal-50 text-teal-800 ring-teal-100 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100 dark:ring-teal-400/20'
        : 'border-slate-200 bg-slate-100 text-slate-700 ring-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
    }

    return this.isPermissionOverride(member, permission)
      ? 'border-rose-200 bg-rose-50 text-rose-700 ring-rose-100 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100 dark:ring-rose-400/20'
      : 'border-slate-200 bg-white text-slate-400 ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500 dark:ring-slate-800';
  }

  permissionStatusLabel(member: CompanyMember, permission: Permission): string {
    if (permission === 'readOnly') {
      return 'Always on';
    }

    if (!this.isPermissionOverride(member, permission)) {
      return 'Role default';
    }

    return this.permissionValue(member, permission) ? 'Custom on' : 'Custom off';
  }

  dateLabel(value: unknown): string {
    const timestamp = value as { toDate?: () => Date };
    const date = timestamp?.toDate
      ? timestamp.toDate()
      : value instanceof Date
        ? value
        : typeof value === 'string'
          ? new Date(value)
          : null;

    if (!date || Number.isNaN(date.getTime())) {
      return 'Not set';
    }

    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  statusClass(status: string): string {
    if (status === 'active' || status === 'pending') {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
    }

    if (status === 'suspended' || status === 'revoked') {
      return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
    }

    return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
  }

  cancelConfirm(): void {
    this.pendingConfirm = null;
  }

  async confirmAction(): Promise<void> {
    const pending = this.pendingConfirm;

    if (!pending) {
      return;
    }

    await this.runAction(pending.action, pending.successMessage);
    this.pendingConfirm = null;
  }

  private async runAction(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = readableError(error, 'Action failed.');
    } finally {
      this.isBusy = false;
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2400);
  }
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.replace('Firebase: ', '') : fallback;
}

interface TeamConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  icon: string;
  tone: 'danger' | 'warning' | 'neutral';
  action: () => Promise<unknown>;
  successMessage: string;
}

const PERMISSION_LABELS: PermissionItem[] = [
  { permission: 'manageCompany', label: 'Company settings', detail: 'Edit workspace name, plan, and company setup' },
  { permission: 'manageMembers', label: 'Manage members', detail: 'Suspend or remove non-founder members' },
  { permission: 'inviteMembers', label: 'Invite team', detail: 'Generate and revoke invite links' },
  { permission: 'manageRoles', label: 'Change access', detail: 'Update member roles and custom permissions' },
  { permission: 'manageFunding', label: 'Funding', detail: 'Create, edit, and delete funding sources' },
  { permission: 'manageExpenses', label: 'Expenses', detail: 'Create, edit, and delete expense records' },
  { permission: 'manageTeamPayments', label: 'Salaries', detail: 'Manage salaries, stipends, contractors, and interns' },
  { permission: 'manageStartupCosts', label: 'Startup costs', detail: 'Manage one-time setup and compliance costs' },
  { permission: 'manageRecurringCosts', label: 'Recurring costs', detail: 'Manage subscriptions and recurring commitments' },
  { permission: 'manageFounderNotes', label: 'Workspace notes', detail: 'Manage decision notes and review context' },
  { permission: 'viewReports', label: 'Reports', detail: 'Open reports and analytics views' },
  { permission: 'exportReports', label: 'Exports', detail: 'Prepare report exports for review' },
  { permission: 'readOnly', label: 'View everything', detail: 'Every active member can view workspace records' },
];

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Admin controls',
    detail: 'Company setup, members, invites, and role access',
    icon: 'shield-check',
    permissions: ['manageCompany', 'manageMembers', 'inviteMembers', 'manageRoles'],
  },
  {
    title: 'Finance records',
    detail: 'Funding, expenses, salaries, startup costs, and recurring costs',
    icon: 'wallet',
    permissions: ['manageFunding', 'manageExpenses', 'manageTeamPayments', 'manageStartupCosts', 'manageRecurringCosts'],
  },
  {
    title: 'Review and reporting',
    detail: 'Workspace notes, reports, exports, and view-only access',
    icon: 'bar-chart-3',
    permissions: ['manageFounderNotes', 'viewReports', 'exportReports', 'readOnly'],
  },
];

interface PermissionItem {
  permission: Permission;
  label: string;
  detail: string;
}

interface PermissionGroup {
  title: string;
  detail: string;
  icon: string;
  permissions: Permission[];
}
