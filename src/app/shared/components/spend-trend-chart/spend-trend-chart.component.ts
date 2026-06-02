import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import { MonthlyTrendPoint } from '../../../core/models/dashboard.models';
import { currencyINR } from '../../../core/utils/finance-formatters';

interface ChartPoint {
  month: string;
  amount: number;
  x: number;
  y: number;
}

@Component({
  selector: 'app-spend-trend-chart',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './spend-trend-chart.component.html',
})
export class SpendTrendChartComponent {
  @Input() points: MonthlyTrendPoint[] = [];
  @Input() title = 'Monthly spend trend';
  @Input() description = 'Cash outflow recorded from expenses, startup costs, salaries, and recurring costs.';
  @Input() compact = false;
  @Input() framed = true;

  readonly viewBox = '0 0 640 280';
  private readonly left = 76;
  private readonly right = 24;
  private readonly top = 24;
  private readonly bottom = 52;
  private readonly width = 640;
  private readonly height = 280;

  get hasData(): boolean {
    return this.points.some((point) => point.amount > 0);
  }

  get shellClass(): string {
    return this.framed
      ? 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80'
      : '';
  }

  get total(): number {
    return this.points.reduce((sum, point) => sum + point.amount, 0);
  }

  get activeMonths(): number {
    return this.points.filter((point) => point.amount > 0).length;
  }

  get average(): number {
    return this.activeMonths > 0 ? this.total / this.activeMonths : 0;
  }

  get peak(): MonthlyTrendPoint {
    return this.points.reduce(
      (peak, point) => point.amount > peak.amount ? point : peak,
      { month: 'No spend', amount: 0 },
    );
  }

  get chartPoints(): ChartPoint[] {
    const points = this.points.length ? this.points : this.emptyYear();
    const max = Math.max(...points.map((point) => point.amount), 1);
    const chartWidth = this.width - this.left - this.right;
    const chartHeight = this.height - this.top - this.bottom;
    const step = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth;

    return points.map((point, index) => ({
      ...point,
      x: this.left + index * step,
      y: this.top + chartHeight - (point.amount / max) * chartHeight,
    }));
  }

  get linePath(): string {
    return this.chartPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  }

  get areaPath(): string {
    const points = this.chartPoints;

    if (!points.length) {
      return '';
    }

    const baseline = this.height - this.bottom;
    return `${this.linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  }

  get yAxisLabels(): number[] {
    const max = Math.max(...this.points.map((point) => point.amount), 0);

    if (max <= 0) {
      return [0, 0, 0];
    }

    return [max, max / 2, 0];
  }

  get monthLabels(): ChartPoint[] {
    const points = this.chartPoints;

    if (this.compact) {
      return points.filter((_, index) => index === 0 || index === Math.floor(points.length / 2) || index === points.length - 1);
    }

    return points;
  }

  get takeaway(): string {
    if (!this.hasData) {
      return 'No dated spend is available yet, so there is no monthly trend to compare.';
    }

    if (this.activeMonths === 1) {
      return `${this.peak.month} has all recorded spend so far. Add more dated records to compare month over month.`;
    }

    return `${this.peak.month} is the highest spend month at ${this.currencyINR(this.peak.amount)}. Average active-month spend is ${this.currencyINR(this.average)}.`;
  }

  currencyINR(value: number): string {
    return currencyINR(value);
  }

  pointTitle(point: MonthlyTrendPoint): string {
    return `${point.month}: ${this.currencyINR(point.amount)}`;
  }

  yAxisY(index: number): number {
    const chartHeight = this.height - this.top - this.bottom;
    return this.top + (chartHeight / 2) * index;
  }

  private emptyYear(): MonthlyTrendPoint[] {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month) => ({
      month,
      amount: 0,
    }));
  }
}
