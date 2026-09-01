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

import { ThemeService } from '../../../core/services/theme.service';
import { SEMANTIC, gridColor, inrCompact, inrFull, tickColor, tooltipStyle } from './chart-theme';

export interface FundingUtilizationDatum {
  name: string;
  used: number;
  remaining: number;
}

@Component({
  selector: 'app-funding-utilization-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full">
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span class="inline-flex items-center gap-2"><span class="size-2.5 rounded-[3px]" [style.background]="usedColor()"></span>Used</span>
        <span class="inline-flex items-center gap-2"><span class="size-2.5 rounded-[3px]" [style.background]="availableColor()"></span>Available</span>
      </div>
      <div class="relative w-full" [style.height.px]="heightPx()">
        <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
      </div>
    </div>
  `,
})
export class FundingUtilizationChartComponent implements OnDestroy {
  private readonly themeService = inject(ThemeService);

  readonly chartData = input<FundingUtilizationDatum[]>([]);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;
  private resizeObserver?: ResizeObserver;

  readonly heightPx = computed(() => Math.max(this.chartData().length * 44 + 24, 140));
  readonly usedColor = computed(() => SEMANTIC.brand(this.themeService.isDark()));
  readonly availableColor = computed(() => SEMANTIC.available(this.themeService.isDark()));

  ariaLabel = computed(() =>
    'Stacked bar of funding used vs available: ' +
    this.chartData().map((d) => `${d.name} used ${inrFull(d.used)}, available ${inrFull(d.remaining)}`).join('; '),
  );

  constructor() {
    effect(() => {
      const data = this.chartData();
      const isDark = this.themeService.isDark();
      const el = this.canvas()?.nativeElement;
      if (el) {
        this.render(el, data, isDark);
      }
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.destroy();
    this.chart = undefined;
  }

  private render(el: HTMLCanvasElement, data: FundingUtilizationDatum[], isDark: boolean): void {
    this.chart?.destroy();

    this.chart = new Chart(el, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            label: 'Used',
            data: data.map((d) => d.used),
            backgroundColor: SEMANTIC.brand(isDark),
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 18,
            maxBarThickness: 22,
            stack: 'funding',
          },
          {
            label: 'Available',
            data: data.map((d) => d.remaining),
            backgroundColor: SEMANTIC.available(isDark),
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 18,
            maxBarThickness: 22,
            stack: 'funding',
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(isDark),
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${inrFull(Number(ctx.parsed.x))}` },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: gridColor(isDark) },
            border: { display: false },
            ticks: { color: tickColor(isDark), callback: (v) => inrCompact(Number(v)) },
          },
          y: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { color: tickColor(isDark), font: { weight: 500 } },
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
}
