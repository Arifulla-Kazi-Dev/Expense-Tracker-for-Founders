import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyMembership } from '../../core/models/company.model';
import { Tone } from '../../core/models/dashboard.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { PermissionService } from '../../core/services/permission.service';
import { tonePanelClass } from '../../core/utils/ui-classnames';

interface OnboardingStep {
  id: string;
  title: string;
  detail: string;
  icon: string;
  tone: Tone;
  route: string;
  cta: string;
  done: boolean;
}

@Component({
  selector: 'app-follow-up',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, RouterLink],
  templateUrl: './follow-up.component.html',
})
export class FollowUpComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly permissionService = inject(PermissionService);
  private readonly authService = inject(AuthService);

  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly memberships = toSignal(this.permissionService.memberships$, { initialValue: [] as CompanyMembership[] });

  readonly steps = computed<OnboardingStep[]>(() => {
    const summary = this.summary();
    const hasSource = (label: string): boolean => summary.spendSources.some((source) => source.label === label);

    return [
      {
        id: 'funding',
        title: 'Add your first funding source',
        detail: 'Record raised capital, a grant, or founder investment so runway and utilization can be calculated.',
        icon: 'wallet',
        tone: 'teal',
        route: '/funding',
        cta: 'Add funding',
        done: summary.totalFunding > 0,
      },
      {
        id: 'expense',
        title: 'Log your first expense',
        detail: 'Capture a real spend with a category and payment status to start building the company ledger.',
        icon: 'receipt-text',
        tone: 'sky',
        route: '/expenses',
        cta: 'Add expense',
        done: hasSource('Expenses'),
      },
      {
        id: 'team',
        title: 'Add a team salary',
        detail: 'Track founder, employee, or contractor pay so monthly burn reflects real commitments.',
        icon: 'users',
        tone: 'emerald',
        route: '/team-payments',
        cta: 'Add salary',
        done: summary.activeTeamMembers > 0 || hasSource('Salaries'),
      },
      {
        id: 'recurring',
        title: 'Track a recurring cost',
        detail: 'Add subscriptions and tools (monthly, quarterly, yearly) so burn and runway stay accurate.',
        icon: 'repeat-2',
        tone: 'amber',
        route: '/recurring-costs',
        cta: 'Add recurring cost',
        done: hasSource('Recurring Costs'),
      },
      {
        id: 'note',
        title: 'Record a workspace note',
        detail: 'Document the reasoning behind a key spend decision and its expected benefit.',
        icon: 'notebook-text',
        tone: 'slate',
        route: '/founder-notes',
        cta: 'Add note',
        done: summary.decisionNotes.length > 0,
      },
      {
        id: 'invite',
        title: 'Invite a teammate',
        detail: 'Bring in a co-founder, finance manager, or advisor with role-scoped access.',
        icon: 'user-plus',
        tone: 'rose',
        route: '/team',
        cta: 'Invite member',
        done: this.memberships().length > 1,
      },
    ];
  });

  readonly completedCount = computed(() => this.steps().filter((step) => step.done).length);
  readonly totalSteps = computed(() => this.steps().length);
  readonly progress = computed(() => Math.round((this.completedCount() / this.totalSteps()) * 100));
  readonly allComplete = computed(() => this.completedCount() === this.totalSteps());
  readonly nextStep = computed(() => this.steps().find((step) => !step.done) ?? null);

  readonly firstName = computed(() => {
    const name = this.profile()?.name?.trim();
    return name ? name.split(/\s+/)[0] : 'Founder';
  });

  tonePanelClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  headline(): string {
    if (this.allComplete()) {
      return 'Your workspace is fully set up.';
    }

    if (this.completedCount() === 0) {
      return `Welcome aboard, ${this.firstName()}. Let's set up your workspace.`;
    }

    return `Nice progress, ${this.firstName()}. A few steps left.`;
  }
}
