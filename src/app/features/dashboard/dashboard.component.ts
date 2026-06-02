import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { Direction, PaymentStatus, Tone } from '../../core/models/dashboard.models';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import {
  badgeClass,
  directionClass,
  directionIcon,
  priorityClass,
  progressClass,
  softTextClass,
  tonePanelClass,
} from '../../core/utils/ui-classnames';
import { SpendTrendChartComponent } from '../../shared/components/spend-trend-chart/spend-trend-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [A11yModule, CommonModule, FormsModule, LucideDynamicIcon, RouterLink, SpendTrendChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnDestroy {
  private readonly dashboardService = inject(DashboardService);

  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  readonly ranges = ['This month', 'Quarter', 'Year'];

  selectedRange = 'This month';
  searchQuery = '';
  isModalOpen = false;
  isLoading = false;
  toastMessage = '';

  private toastTimer?: ReturnType<typeof setTimeout>;
  private loadingTimer?: ReturnType<typeof setTimeout>;

  get filteredPayments() {
    const query = this.searchQuery.trim().toLowerCase();
    const payments = this.summary().ledgerPayments;

    if (!query) {
      return payments;
    }

    return payments.filter((payment) =>
      [payment.title, payment.owner, payment.category, payment.status]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }

  get dashboardAlerts(): DashboardAlert[] {
    const summary = this.summary();

    if (!summary.hasData) {
      return [
        {
          title: 'Workspace ready for live records',
          detail: 'Start with funding, then add expenses so runway and utilization become meaningful.',
          icon: 'shield-check',
          tone: 'sky',
          actionLabel: 'Add funding',
          route: '/funding',
        },
      ];
    }

    const alerts: DashboardAlert[] = [];

    if (summary.monthlyBurn > 0 && summary.estimatedRunway < 6) {
      alerts.push({
        title: 'Runway below the 6 month floor',
        detail: `${summary.estimatedRunway} months remaining at the current burn rate.`,
        icon: 'alert-circle',
        tone: 'rose',
        actionLabel: 'Review costs',
        route: '/recurring-costs',
      });
    }

    if (summary.totalPending > 0) {
      alerts.push({
        title: 'Pending payments need attention',
        detail: `${currencyINR(summary.totalPending)} is still open across the founder ledger.`,
        icon: 'calendar-clock',
        tone: 'amber',
        actionLabel: 'Open expenses',
        route: '/expenses',
      });
    }

    if (summary.remainingBalance > 0 && summary.estimatedRunway >= 6) {
      alerts.push({
        title: 'Cash runway looks healthy',
        detail: 'Available cash remains above the founder safety threshold.',
        icon: 'check-circle-2',
        tone: 'emerald',
      });
    }

    return alerts.slice(0, 3);
  }

  ngOnDestroy(): void {
    this.clearTimer(this.toastTimer);
    this.clearTimer(this.loadingTimer);
  }

  currencyINR(value: number): string {
    return currencyINR(value);
  }

  setRange(range: string): void {
    this.selectedRange = range;
    this.showToast(`${range} view selected`);
  }

  openModal(): void {
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  saveDraftExpense(): void {
    this.closeModal();
    this.showToast('Draft expense saved for review');
  }

  simulateRefresh(): void {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.showToast('Syncing dashboard metrics');
    this.loadingTimer = setTimeout(() => {
      this.isLoading = false;
      this.showToast('Dashboard metrics refreshed');
    }, 900);
  }

  percentage(amount: number, budget: number): number {
    if (budget <= 0) {
      return 0;
    }

    return Math.min(Math.round((amount / budget) * 100), 100);
  }

  hasBurnTrend(): boolean {
    return this.summary().monthlySpendTrend.some((point) => point.amount > 0);
  }

  tonePanelClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  progressClass(tone: Tone): string {
    return progressClass(tone);
  }

  softTextClass(tone: Tone): string {
    return softTextClass(tone);
  }

  badgeClass(status: PaymentStatus): string {
    return badgeClass(status);
  }

  priorityClass(priority: 'High' | 'Medium' | 'Low'): string {
    return priorityClass(priority);
  }

  directionIcon(direction: Direction): string {
    return directionIcon(direction);
  }

  directionClass(direction: Direction): string {
    return directionClass(direction);
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.clearTimer(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2200);
  }

  private clearTimer(timer?: ReturnType<typeof setTimeout>): void {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

interface DashboardAlert {
  title: string;
  detail: string;
  icon: string;
  tone: Tone;
  actionLabel?: string;
  route?: string;
}
