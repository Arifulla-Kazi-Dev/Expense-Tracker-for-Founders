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
import {
  ChartDatum,
  gridColor,
  inrCompact,
  inrFull,
  resolveColors,
  tickColor,
  tooltipStyle,
} from './chart-theme';

@Component({
  selector: 'app-finance-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative w-full" [style.height.px]="heightPx()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
  `,
})
export class FinanceBarComponent implements OnDestroy {
  private readonly themeService = inject(ThemeService);

  readonly chartData = input<ChartDatum[]>([]);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;
  private resizeObserver?: ResizeObserver;

  readonly heightPx = computed(() => Math.max(this.chartData().length * 46 + 24, 140));

  ariaLabel = computed(() =>
    'Bar chart: ' + this.chartData().map((d) => `${d.name} ${inrFull(d.value)}`).join(', '),
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

    this.chart = new Chart(el, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            data: data.map((d) => d.value),
            backgroundColor: resolveColors(data, isDark),
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 22,
            maxBarThickness: 26,
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
            callbacks: { label: (ctx) => ` ${inrFull(Number(ctx.parsed.x))}` },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor(isDark) },
            border: { display: false },
            ticks: { color: tickColor(isDark), callback: (v) => inrCompact(Number(v)) },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: tickColor(isDark), font: { weight: 500 } },
          },
        },
      },
    });

    if (!this.resizeObserver && el.parentElement) {
      // The container's size isn't guaranteed to be settled yet on first render, so
      // Chart.js can paint blank if resize() is only ever called once, at a guessed
      // time. Observing the parent fires once its real layout is committed (and again
      // on any later resize), which is what actually keeps this in sync — a fixed
      // delay was never a reliable substitute for that.
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el.parentElement);
    } else {
      this.chart.resize();
    }
  }
}
