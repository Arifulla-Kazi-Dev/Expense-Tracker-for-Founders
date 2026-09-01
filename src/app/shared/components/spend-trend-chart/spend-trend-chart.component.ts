import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Chart } from 'chart.js';
import { LucideDynamicIcon } from '@lucide/angular';

import { MonthlyTrendPoint } from '../../../core/models/dashboard.models';
import { currencyINR } from '../../../core/utils/finance-formatters';
import { ThemeService } from '../../../core/services/theme.service';
import {
  brandColor,
  gridColor,
  inrCompact,
  inrFull,
  tickColor,
  tooltipStyle,
} from '../charts/chart-theme';

@Component({
  selector: 'app-spend-trend-chart',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './spend-trend-chart.component.html',
})
export class SpendTrendChartComponent implements OnDestroy {
  private readonly themeService = inject(ThemeService);

  readonly points = input<MonthlyTrendPoint[]>([]);
  readonly title = input('Monthly spend trend');
  readonly description = input('Cash outflow recorded from expenses, startup costs, salaries, and recurring costs.');
  readonly compact = input(false);
  readonly framed = input(true);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;
  private resizeObserver?: ResizeObserver;

  readonly shellClass = computed(() => (this.framed() ? 'ui-panel rounded-2xl p-5' : ''));
  readonly hasData = computed(() => this.points().some((p) => p.amount > 0));
  readonly total = computed(() => this.points().reduce((sum, p) => sum + p.amount, 0));
  readonly activeMonths = computed(() => this.points().filter((p) => p.amount > 0).length);
  readonly average = computed(() => (this.activeMonths() > 0 ? this.total() / this.activeMonths() : 0));

  readonly peak = computed<MonthlyTrendPoint>(() =>
    this.points().reduce((peak, p) => (p.amount > peak.amount ? p : peak), { month: 'No spend', amount: 0 }),
  );

  readonly trendSignal = computed(() => {
    const active = this.points().filter((p) => p.amount > 0);
    if (active.length < 2) {
      return active.length ? 'First spend month recorded' : 'Waiting for spend data';
    }
    const delta = active[active.length - 1].amount - active[active.length - 2].amount;
    if (delta === 0) {
      return 'Spend is flat versus the previous active month';
    }
    return `Spend ${delta > 0 ? 'increased' : 'decreased'} by ${currencyINR(Math.abs(delta))} versus ${active[active.length - 2].month}`;
  });

  readonly takeaway = computed(() => {
    if (!this.hasData()) {
      return 'No dated spend is available yet, so there is no monthly trend to compare.';
    }
    if (this.activeMonths() === 1) {
      return `${this.peak().month} has all recorded spend so far. Add more dated records to compare month over month.`;
    }
    return `${this.peak().month} is the highest spend month at ${currencyINR(this.peak().amount)}. Average active-month spend is ${currencyINR(this.average())}.`;
  });

  constructor() {
    effect(() => {
      const points = this.points();
      const isDark = this.themeService.isDark();
      const el = this.canvas()?.nativeElement;
      if (el && this.hasData()) {
        this.render(el, points, isDark);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.destroy();
    this.chart = undefined;
  }

  currencyINR(value: number): string {
    return currencyINR(value);
  }

  private render(el: HTMLCanvasElement, points: MonthlyTrendPoint[], isDark: boolean): void {
    this.chart?.destroy();
    const accent = brandColor(isDark);
    const ctx = el.getContext('2d');
    let fill: CanvasGradient | string = isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.12)';
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, el.clientHeight || 260);
      gradient.addColorStop(0, isDark ? 'rgba(167,139,250,0.32)' : 'rgba(124,58,237,0.26)');
      gradient.addColorStop(1, isDark ? 'rgba(167,139,250,0.01)' : 'rgba(124,58,237,0.01)');
      fill = gradient;
    }

    this.chart = new Chart(el, {
      type: 'line',
      data: {
        labels: points.map((p) => this.shortLabel(p.month)),
        datasets: [
          {
            label: 'Cash outflow',
            data: points.map((p) => Math.round(p.amount)),
            borderColor: accent,
            backgroundColor: fill,
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: accent,
            pointHoverBorderColor: isDark ? '#0e0e1a' : '#ffffff',
            pointHoverBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(isDark),
            callbacks: {
              title: (items) => points[items[0].dataIndex]?.month ?? '',
              label: (ctx2) => ` ${inrFull(Number(ctx2.parsed.y))}`,
            },
          },
        },
        scales: {
          y: {
            grid: { color: gridColor(isDark) },
            border: { display: false },
            ticks: { color: tickColor(isDark), callback: (v) => inrCompact(Number(v)), maxTicksLimit: 5 },
          },
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: tickColor(isDark), maxRotation: 0, autoSkipPadding: 12 },
          },
        },
      },
    });

    if (!this.resizeObserver && el.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el.parentElement);
    } else {
      this.chart.resize();
    }
  }

  private shortLabel(month: string): string {
    const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(month);
    return match ? `${match[1]} '${match[2].slice(2)}` : month;
  }
}
