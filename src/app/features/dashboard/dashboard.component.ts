import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { PaymentStatus, Tone } from '../../core/models/dashboard.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { LedgerExportFormat, LedgerExportService } from '../../core/services/ledger-export.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import {
  badgeClass,
  priorityClass,
  progressClass,
  softTextClass,
  tonePanelClass,
} from '../../core/utils/ui-classnames';
import { ChartDatum } from '../../shared/components/charts/chart-theme';
import { FinanceBarComponent } from '../../shared/components/charts/finance-bar.component';
import { FinanceDonutComponent } from '../../shared/components/charts/finance-donut.component';
import {
  FundingUtilizationChartComponent,
  FundingUtilizationDatum,
} from '../../shared/components/charts/funding-utilization-chart.component';
import { SpendTrendChartComponent } from '../../shared/components/spend-trend-chart/spend-trend-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideDynamicIcon,
    RouterLink,
    SpendTrendChartComponent,
    FinanceBarComponent,
    FinanceDonutComponent,
    FundingUtilizationChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly ledgerExportService = inject(LedgerExportService);

  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
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

  get topCategory() {
    return this.summary().categorySpends[0] ?? null;
  }

  // These feed Chart.js components via a signal `input()`, which compares by
  // reference. A plain getter would build a new array on every change-detection
  // check (even when nothing changed), making the chart think its data changed
  // constantly and destroy/recreate itself before a frame ever paints. `computed()`
  // only recomputes when `summary()` itself actually changes, so the reference
  // stays stable in between.
  readonly categoryChartData = computed<ChartDatum[]>(() =>
    this.summary().categorySpends.map((category) => ({
      name: category.label,
      value: category.amount,
      tone: category.tone,
    })),
  );

  readonly spendSourceChartData = computed<ChartDatum[]>(() =>
    this.summary().spendSources.map((source) => ({
      name: source.label,
      value: source.amount,
      tone: source.tone,
    })),
  );

  readonly cashAllocationChartData = computed<ChartDatum[]>(() => {
    const summary = this.summary();
    return [
      { name: 'Paid spend', value: summary.totalPaid, tone: 'teal' },
      { name: 'Pending', value: summary.totalPending, tone: 'amber' },
      { name: 'Available cash', value: summary.remainingBalance, tone: 'emerald' },
    ].filter((datum) => datum.value > 0) as ChartDatum[];
  });

  readonly fundingUtilizationChartData = computed<FundingUtilizationDatum[]>(() =>
    this.summary().fundingUtilization.map((source) => ({
      name: source.sourceName,
      used: source.utilized,
      remaining: source.remaining,
    })),
  );

  get keyMetrics() {
    return this.summary().founderMetrics.slice(0, 8);
  }

  get reviewHighlights(): Array<{ label: string; value: string; detail: string; icon: string; tone: Tone }> {
    const summary = this.summary();

    return [
      {
        label: 'Cash reserve',
        value: currencyINR(summary.remainingBalance),
        detail: summary.totalFunding > 0 ? `${this.availableShare()}% of funding still available` : 'Add funding to calculate reserve',
        icon: 'landmark',
        tone: 'emerald',
      },
      {
        label: 'Burn source',
        value: summary.monthlyBurn > 0 ? currencyINR(summary.monthlyBurn) : 'Pending',
        detail: summary.monthlyBurnDetail,
        icon: 'circle-gauge',
        tone: summary.monthlyBurn > 0 ? 'rose' : 'sky',
      },
      {
        label: 'Largest category',
        value: this.topCategory?.label ?? 'No spend',
        detail: this.topCategory ? `${this.topCategoryShare()}% of tracked spend` : 'Add categories to unlock concentration',
        icon: 'radar',
        tone: this.topCategoryShare() > 45 ? 'amber' : 'teal',
      },
    ];
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

    if (summary.remainingBalance > 0 && !summary.canCalculateRunway) {
      alerts.push({
        title: 'Runway needs monthly burn data',
        detail: 'Cash is recorded, but no monthly or dated spend is available for runway calculation.',
        icon: 'clock-3',
        tone: 'sky',
        actionLabel: 'Add recurring cost',
        route: '/recurring-costs',
      });
    }

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
        detail: `${currencyINR(summary.totalPending)} is still open across the company ledger.`,
        icon: 'calendar-clock',
        tone: 'amber',
        actionLabel: 'Open expenses',
        route: '/expenses',
      });
    }

    if (summary.remainingBalance > 0 && summary.estimatedRunway >= 6) {
      alerts.push({
        title: 'Cash runway looks healthy',
        detail: 'Available cash remains above the company safety threshold.',
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

  runwayHeading(): string {
    const summary = this.summary();

    if (!summary.hasData) {
      return 'Add funding and monthly costs to calculate company runway.';
    }

    if (!summary.canCalculateRunway) {
      return 'Runway is not calculated yet because burn data is not recorded.';
    }

    return `At current spending rate you have approximately ${summary.runwayLabel} of runway remaining.`;
  }

  runwaySubcopy(): string {
    const summary = this.summary();

    if (!summary.canCalculateRunway) {
      return `Available cash is ${currencyINR(summary.remainingBalance)}, but monthly burn has no source yet. Add paid salaries, active recurring costs, or dated spend records to calculate runway.`;
    }

    return `${summary.runwayExplanation}. Available cash is ${currencyINR(summary.remainingBalance)} against a monthly burn of ${currencyINR(summary.monthlyBurn)}.`;
  }

  runwayTone(): string {
    const summary = this.summary();

    if (!summary.canCalculateRunway) {
      return 'Needs burn data';
    }

    if (summary.estimatedRunway < 6) {
      return 'Critical runway';
    }

    if (summary.estimatedRunway < 12) {
      return 'Watch runway';
    }

    return 'Healthy runway';
  }

  runwayRiskCopy(): string {
    const summary = this.summary();

    if (!summary.hasData) {
      return 'Connect the first funding and expense records to turn this into a live company operating view.';
    }

    if (!summary.canCalculateRunway) {
      return 'Cash exists, but there is no reliable burn baseline yet. Add recurring costs or team payments first.';
    }

    if (summary.estimatedRunway < 6) {
      return 'Runway is below the safety floor. Review recurring tools, salaries, and the largest category this week.';
    }

    if (summary.estimatedRunway < 12) {
      return 'Runway is workable, but still below a clean 12 month planning target.';
    }

    return 'Runway is above target. Keep reviewing concentration and pending commitments before new spending.';
  }

  healthToneClass(): string {
    const score = this.healthScore();

    if (score >= 78) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
    }

    if (score >= 55) {
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
    }

    return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
  }

  healthScore(): number {
    const summary = this.summary();
    let score = 92;

    if (!summary.hasData) {
      return 0;
    }

    if (!summary.canCalculateRunway) {
      score -= 28;
    } else if (summary.estimatedRunway < 6) {
      score -= 30;
    } else if (summary.estimatedRunway < 12) {
      score -= 12;
    }

    if (summary.utilizationPercentage > 80) {
      score -= 16;
    } else if (summary.utilizationPercentage > 55) {
      score -= 8;
    }

    if (summary.totalPending > 0) {
      score -= Math.min(16, 6 + summary.pendingPaymentsCount * 2);
    }

    if (this.topCategoryShare() >= 50) {
      score -= 8;
    }

    return Math.max(Math.min(score, 100), 0);
  }

  healthLabel(): string {
    const score = this.healthScore();

    if (score >= 78) {
      return 'Operating well';
    }

    if (score >= 55) {
      return 'Needs attention';
    }

    return 'Workspace review needed';
  }

  runwayGauge(): number {
    return Math.min(this.summary().runwayProgress, 100);
  }

  paidShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.min(Math.round((this.summary().totalPaid / totalFunding) * 100), 100) : 0;
  }

  pendingShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.min(Math.round((this.summary().totalPending / totalFunding) * 100), 100) : 0;
  }

  availableShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.max(100 - this.paidShare(), 0) : 0;
  }

  pendingDisplayShare(): number {
    return Math.min(this.pendingShare(), Math.max(100 - this.paidShare(), 0));
  }

  availableDisplayShare(): number {
    return Math.max(100 - this.paidShare() - this.pendingDisplayShare(), 0);
  }

  pendingRiskShare(): number {
    const total = this.summary().totalPaid + this.summary().totalPending;
    return total > 0 ? Math.round((this.summary().totalPending / total) * 100) : 0;
  }

  categoryShare(amount: number): number {
    const totalExpenses = this.summary().totalExpenses;
    return totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
  }

  topCategoryShare(): number {
    return this.topCategory ? this.categoryShare(this.topCategory.amount) : 0;
  }

  sourceShare(amount: number): number {
    const totalExpenses = this.summary().totalExpenses;
    return totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
  }

  spendMomentum(): string {
    const active = this.summary().monthlySpendTrend.filter((point) => point.amount > 0);

    if (!active.length) {
      return 'No spend trend yet';
    }

    if (active.length === 1) {
      return `${active[0].month} is the only active spend month`;
    }

    const latest = active[active.length - 1];
    const previous = active[active.length - 2];
    const delta = latest.amount - previous.amount;

    if (delta === 0) {
      return `${latest.month} spend is flat versus ${previous.month}`;
    }

    return `${latest.month} spend is ${delta > 0 ? 'up' : 'down'} ${currencyINR(Math.abs(delta))} versus ${previous.month}`;
  }

  cashEfficiencyCopy(): string {
    const summary = this.summary();

    if (summary.totalFunding <= 0) {
      return 'No capital has been recorded yet, so cash efficiency is waiting for funding data.';
    }

    if (summary.totalPaid <= 0) {
      return 'Capital is recorded and no paid spend has cleared yet.';
    }

    return `${summary.utilizationPercentage}% of funding is paid out. ${currencyINR(summary.remainingBalance)} remains available after cleared spend.`;
  }

  dataConfidenceCopy(): string {
    const summary = this.summary();

    if (!summary.hasData) {
      return 'No cloud ledger data yet.';
    }

    const activeAreas = [
      summary.totalFunding > 0,
      summary.totalExpenses > 0,
      summary.activeTeamMembers > 0,
      summary.decisionNotes.length > 0,
    ].filter(Boolean).length;

    return `${activeAreas} of 4 operating areas have live records: funding, spend, team, and workspace notes.`;
  }

  nextBestAction(): { label: string; detail: string; route: string; icon: string } {
    const summary = this.summary();

    if (summary.totalFunding <= 0) {
      return {
        label: 'Record your first funding source',
        detail: 'Start with capital so utilization and runway can be calculated.',
        route: '/funding',
        icon: 'wallet',
      };
    }

    if (!summary.canCalculateRunway) {
      return {
        label: 'Add monthly burn data',
        detail: 'Use salaries, recurring costs, or dated spend to make runway reliable.',
        route: '/recurring-costs',
        icon: 'repeat-2',
      };
    }

    if (summary.totalPending > 0) {
      return {
        label: 'Clear pending commitments',
        detail: `${currencyINR(summary.totalPending)} is still open across the ledger.`,
        route: '/expenses',
        icon: 'calendar-clock',
      };
    }

    return {
      label: 'Review monthly trend',
      detail: this.spendMomentum(),
      route: '/reports',
      icon: 'line-chart',
    };
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

  canExport(): boolean {
    return this.ledgerExportService.canExport();
  }

  exportLedger(format: LedgerExportFormat): void {
    try {
      this.ledgerExportService.exportSummary(this.summary(), format, {
        companyName: this.profile()?.companyName,
        exportedBy: this.profile()?.name,
        email: this.profile()?.email,
      });
      this.showToast(`${format.toUpperCase()} export downloaded`);
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Unable to export ledger');
    }
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
