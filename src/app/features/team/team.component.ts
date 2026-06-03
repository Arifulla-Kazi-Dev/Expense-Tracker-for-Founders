import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyInvite, CompanyMember } from '../../core/models/company.model';
import { Permission, ROLE_OPTIONS, ROLE_PERMISSIONS, INVITABLE_ROLES, UserRole, roleDisplayName } from '../../core/models/role.model';
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

  readonly inviteForm = this.formBuilder.nonNullable.group({
    role: ['finance-manager' as UserRole, [Validators.required]],
    invitedEmail: ['', [Validators.email]],
    invitedPhone: [''],
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

    return `${count} permission${count === 1 ? '' : 's'} enabled for this role.`;
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
        invitedEmail: '',
        invitedPhone: '',
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
    return this.canManage() && member.role !== 'founder' && member.uid !== this.authService.currentUser?.uid;
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

const PERMISSION_LABELS: Array<{ permission: Permission; label: string }> = [
  { permission: 'manageCompany', label: 'Company settings' },
  { permission: 'manageMembers', label: 'Manage members' },
  { permission: 'inviteMembers', label: 'Invite team' },
  { permission: 'manageRoles', label: 'Role changes' },
  { permission: 'manageFunding', label: 'Funding records' },
  { permission: 'manageExpenses', label: 'Expense records' },
  { permission: 'manageTeamPayments', label: 'Salaries' },
  { permission: 'manageStartupCosts', label: 'Startup costs' },
  { permission: 'manageRecurringCosts', label: 'Recurring costs' },
  { permission: 'manageFounderNotes', label: 'Workspace notes' },
  { permission: 'viewReports', label: 'Reports' },
  { permission: 'exportReports', label: 'Exports' },
  { permission: 'readOnly', label: 'Read-only access' },
];
