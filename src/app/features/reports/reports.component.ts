import { Component, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';

import { emptyDashboardSummary } from '../../core/services/dashboard.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { LedgerExportFormat, LedgerExportService } from '../../core/services/ledger-export.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { progressClass, softTextClass, tonePanelClass } from '../../core/utils/ui-classnames';
import { CategorySpend, SpendSource, Tone } from '../../core/models/dashboard.models';
import { ChartDatum } from '../../shared/components/charts/chart-theme';
import { FinanceBarComponent } from '../../shared/components/charts/finance-bar.component';
import { FinanceDonutComponent } from '../../shared/components/charts/finance-donut.component';
import { SpendTrendChartComponent } from '../../shared/components/spend-trend-chart/spend-trend-chart.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, SpendTrendChartComponent, FinanceBarComponent, FinanceDonutComponent],
  templateUrl: './reports.component.html',
})
export class ReportsComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly ledgerExportService = inject(LedgerExportService);

  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });

  toastMessage = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  currencyINR(value: number): string {
    return currencyINR(value);
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

  hasBurnTrend(): boolean {
    return this.summary().monthlySpendTrend.some((point) => point.amount > 0);
  }

  hasSpendData(): boolean {
    return this.summary().totalExpenses > 0;
  }

  topCategory(): CategorySpend | null {
    return this.summary().categorySpends[0] ?? null;
  }

  // computed(), not plain methods: these feed Chart.js components via a signal
  // input(), which compares by reference. A method called fresh from the template
  // on every change-detection check would build a new array each time even when
  // nothing changed, making the chart destroy/recreate itself constantly instead
  // of painting. computed() only recomputes when summary() actually changes.
  readonly capitalSplitChartData = computed<ChartDatum[]>(() => {
    const summary = this.summary();
    return [
      { name: 'Paid spend', value: summary.totalPaid, tone: 'teal' },
      { name: 'Pending', value: summary.totalPending, tone: 'amber' },
      { name: 'Available cash', value: summary.remainingBalance, tone: 'emerald' },
    ].filter((datum) => datum.value > 0) as ChartDatum[];
  });

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

  topCategoryShare(): number {
    const topCategory = this.topCategory();
    const totalExpenses = this.summary().totalExpenses;

    if (!topCategory || totalExpenses <= 0) {
      return 0;
    }

    return Math.round((topCategory.amount / totalExpenses) * 100);
  }

  sourceShare(source: SpendSource): number {
    const totalExpenses = this.summary().totalExpenses;
    return totalExpenses > 0 ? Math.round((source.amount / totalExpenses) * 100) : 0;
  }

  categoryShare(category: CategorySpend): number {
    const totalExpenses = this.summary().totalExpenses;
    return totalExpenses > 0 ? Math.round((category.amount / totalExpenses) * 100) : 0;
  }

  reportFinding(): string {
    const summary = this.summary();
    const topCategory = this.topCategory();

    if (!summary.hasData) {
      return 'No live finance records are available yet. Add funding and expenses to generate company-ready insights.';
    }

    if (summary.monthlyBurn <= 0) {
      return `${this.currencyINR(summary.totalPaid)} has been paid, but monthly burn is still not calculable because no monthly or dated spend is recorded.`;
    }

    if (summary.estimatedRunway < 6) {
      return `Runway is below the 6 month floor at ${summary.estimatedRunway} months. Review salaries, recurring costs, and the largest spend category first.`;
    }

    if (topCategory && this.topCategoryShare() >= 45) {
      return `${topCategory.label} is the largest concentration at ${this.topCategoryShare()}% of tracked spend. Monitor whether this is a one-time setup cost or a repeated pattern.`;
    }

    return `Runway is ${summary.estimatedRunway} months and funding utilization is ${summary.utilizationPercentage}%. Spend is distributed across ${summary.categorySpends.length} categories.`;
  }

  reportScore(): number {
    const summary = this.summary();

    if (!summary.hasData) {
      return 0;
    }

    let score = 88;

    if (!summary.canCalculateRunway) {
      score -= 24;
    } else if (summary.estimatedRunway < 6) {
      score -= 28;
    } else if (summary.estimatedRunway < 12) {
      score -= 12;
    }

    if (summary.utilizationPercentage > 80) {
      score -= 16;
    }

    if (summary.totalPending > 0) {
      score -= Math.min(14, summary.pendingPaymentsCount * 3);
    }

    if (this.topCategoryShare() > 50) {
      score -= 8;
    }

    return Math.max(Math.min(score, 100), 0);
  }

  reportScoreToneClass(): string {
    const score = this.reportScore();

    if (score >= 78) {
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
    }

    if (score >= 55) {
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
    }

    return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
  }

  forecastQuarterBurn(): number {
    return this.summary().monthlyBurn * 3;
  }

  pendingRiskShare(): number {
    const total = this.summary().totalPaid + this.summary().totalPending;
    return total > 0 ? Math.round((this.summary().totalPending / total) * 100) : 0;
  }

  runwayStatement(): string {
    const summary = this.summary();

    if (!summary.canCalculateRunway) {
      return 'Runway is waiting for reliable monthly burn data.';
    }

    if (summary.estimatedRunway < 6) {
      return 'Runway is below the company safety floor.';
    }

    if (summary.estimatedRunway < 12) {
      return 'Runway is workable, but below a 12 month operating target.';
    }

    return 'Runway is above the 12 month operating target.';
  }

  runwayProgress(): number {
    return this.summary().runwayProgress;
  }

  paidFundingShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.min(Math.round((this.summary().totalPaid / totalFunding) * 100), 100) : 0;
  }

  remainingFundingShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.max(100 - this.paidFundingShare(), 0) : 0;
  }

  runwayLabel(): string {
    return this.summary().runwayLabel;
  }

  runwayExplanation(): string {
    const summary = this.summary();

    if (summary.monthlyBurn <= 0) {
      return 'Runway needs burn data. Add paid salaries, recurring costs, or dated spend records to calculate how many months current cash can support.';
    }

    return `${summary.runwayExplanation}: available cash ${this.currencyINR(summary.remainingBalance)} divided by monthly burn ${this.currencyINR(summary.monthlyBurn)}.`;
  }

  concentrationExplanation(): string {
    const topCategory = this.topCategory();

    if (!topCategory) {
      return 'Category concentration appears after you add expense or startup cost records.';
    }

    return `${topCategory.label} is currently the largest bucket at ${this.currencyINR(topCategory.amount)}, representing ${this.topCategoryShare()}% of all tracked spend.`;
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
      this.showToast(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Unable to export report');
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2200);
  }
}
