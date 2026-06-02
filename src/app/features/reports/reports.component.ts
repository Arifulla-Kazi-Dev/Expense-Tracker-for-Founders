import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';

import { emptyDashboardSummary } from '../../core/services/dashboard.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { progressClass, tonePanelClass } from '../../core/utils/ui-classnames';
import { CategorySpend, SpendSource, Tone } from '../../core/models/dashboard.models';
import { SpendTrendChartComponent } from '../../shared/components/spend-trend-chart/spend-trend-chart.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, SpendTrendChartComponent],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly dashboardService = inject(DashboardService);

  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });

  currencyINR(value: number): string {
    return currencyINR(value);
  }

  tonePanelClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  progressClass(tone: Tone): string {
    return progressClass(tone);
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

  availableCashShare(): number {
    const totalFunding = this.summary().totalFunding;
    return totalFunding > 0 ? Math.max(100 - this.summary().utilizationPercentage, 0) : 0;
  }

  allocationGradient(): string {
    const used = this.summary().utilizationPercentage;
    return `conic-gradient(#2dd4bf 0 ${used}%, #1e293b ${used}% 100%)`;
  }

  reportFinding(): string {
    const summary = this.summary();
    const topCategory = this.topCategory();

    if (!summary.hasData) {
      return 'No live finance records are available yet. Add funding and expenses to generate founder-ready insights.';
    }

    if (summary.monthlyBurn <= 0) {
      return `${this.currencyINR(summary.totalPaid)} has been paid, but monthly burn is still not calculable because no paid salaries or active recurring costs are recorded.`;
    }

    if (summary.estimatedRunway < 6) {
      return `Runway is below the 6 month floor at ${summary.estimatedRunway} months. Review salaries, recurring costs, and the largest spend category first.`;
    }

    if (topCategory && this.topCategoryShare() >= 45) {
      return `${topCategory.label} is the largest concentration at ${this.topCategoryShare()}% of tracked spend. Monitor whether this is a one-time setup cost or a repeated pattern.`;
    }

    return `Runway is ${summary.estimatedRunway} months and funding utilization is ${summary.utilizationPercentage}%. Spend is distributed across ${summary.categorySpends.length} categories.`;
  }

  runwayExplanation(): string {
    const summary = this.summary();

    if (summary.monthlyBurn <= 0) {
      return 'Runway needs recurring burn. Add paid salaries or recurring costs to calculate how many months the current cash can support.';
    }

    return `Runway is calculated as available cash ${this.currencyINR(summary.remainingBalance)} divided by monthly burn ${this.currencyINR(summary.monthlyBurn)}.`;
  }

  concentrationExplanation(): string {
    const topCategory = this.topCategory();

    if (!topCategory) {
      return 'Category concentration appears after you add expense or startup cost records.';
    }

    return `${topCategory.label} is currently the largest bucket at ${this.currencyINR(topCategory.amount)}, representing ${this.topCategoryShare()}% of all tracked spend.`;
  }
}
