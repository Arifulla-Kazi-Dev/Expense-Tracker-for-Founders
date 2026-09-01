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
import { ChartDatum, inrFull, resolveColors, tooltipStyle } from './chart-theme';

@Component({
  selector: 'app-finance-donut',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full">
      <div class="relative mx-auto h-52 w-full max-w-[15rem]">
        <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
        @if (centerLabel()) {
          <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p class="metric-number text-2xl font-semibold leading-none">{{ centerValue() }}</p>
            <p class="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{{ centerLabel() }}</p>
          </div>
        }
      </div>

      @if (showLegend()) {
        <div class="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
          @for (item of legend(); track item.name) {
            <span class="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span class="size-2.5 rounded-[3px]" [style.background]="item.color"></span>
              <span class="font-medium">{{ item.name }}</span>
              <span class="text-slate-400 dark:text-slate-500">{{ item.percent }}%</span>
            </span>
          }
        </div>
      }
    </div>
  `,
})
export class FinanceDonutComponent implements OnDestroy {
  private readonly themeService = inject(ThemeService);

  readonly chartData = input<ChartDatum[]>([]);
  readonly showLegend = input(true);
  readonly centerLabel = input('');
  readonly centerValue = input('');

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;
  private resizeObserver?: ResizeObserver;

  readonly colors = computed(() => resolveColors(this.chartData(), this.themeService.isDark()));

  readonly legend = computed(() => {
    const data = this.chartData();
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    const colors = this.colors();
    return data.map((d, i) => ({
      name: d.name,
      color: colors[i],
      percent: Math.round((d.value / total) * 100),
    }));
  });

  ariaLabel = computed(() =>
    'Doughnut chart: ' + this.chartData().map((d) => `${d.name} ${inrFull(d.value)}`).join(', '),
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

  private render(el: HTMLCanvasElement, data: ChartDatum[], isDark: boolean): void {
    this.chart?.destroy();
    const colors = resolveColors(data, isDark);

    this.chart = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            data: data.map((d) => d.value),
            backgroundColor: colors,
            borderColor: isDark ? '#0e0e1a' : '#ffffff',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(isDark),
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${inrFull(Number(ctx.parsed))}`,
            },
          },
        },
      },
    });

    if (!this.resizeObserver && el.parentElement) {
      // The container's size isn't settled yet on first render, so Chart.js can
      // paint blank without this: observing the parent fires once its real layout
      // is committed (and again on any later resize).
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el.parentElement);
    } else {
      this.chart.resize();
    }
  }
}
