import { Chart, registerables } from 'chart.js';

import { Tone } from '../../../core/models/dashboard.models';
import { currencyINR } from '../../../core/utils/finance-formatters';

// Register Chart.js controllers/elements/scales/plugins once for the whole app.
Chart.register(...registerables);

/** Single named value, optionally pinned to a design tone. */
export interface ChartDatum {
  name: string;
  value: number;
  tone?: Tone;
}

/** Brand line/area colour. */
export function brandColor(isDark: boolean): string {
  return isDark ? '#a78bfa' : '#7c3aed';
}

/** Cohesive violet→indigo categorical ramp (premium, not rainbow). */
export function categoryPalette(isDark: boolean): string[] {
  return isDark
    ? ['#a78bfa', '#8b5cf6', '#818cf8', '#c4b5fd', '#6366f1', '#7c3aed', '#a5b4fc']
    : ['#7c3aed', '#8b5cf6', '#6366f1', '#a78bfa', '#4f46e5', '#9333ea', '#818cf8'];
}

/** Semantic status colours (paid / pending / available, etc.). */
export const SEMANTIC = {
  brand: (d: boolean) => (d ? '#a78bfa' : '#7c3aed'),
  pending: (d: boolean) => (d ? '#fbbf24' : '#f59e0b'),
  available: (d: boolean) => (d ? '#34d399' : '#10b981'),
  danger: (d: boolean) => (d ? '#fb7185' : '#f43f5e'),
};

const TONE_HEX_LIGHT: Record<Tone, string> = {
  teal: '#7c3aed', // brand tone renders violet
  emerald: '#10b981',
  sky: '#6366f1',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#64748b',
};

const TONE_HEX_DARK: Record<Tone, string> = {
  teal: '#a78bfa',
  emerald: '#34d399',
  sky: '#818cf8',
  amber: '#fbbf24',
  rose: '#fb7185',
  slate: '#94a3b8',
};

export function toneColor(tone: Tone, isDark: boolean): string {
  return (isDark ? TONE_HEX_DARK : TONE_HEX_LIGHT)[tone] ?? brandColor(isDark);
}

/** Resolve colours for a data set: explicit tone first, else palette by index. */
export function resolveColors(data: ChartDatum[], isDark: boolean): string[] {
  const palette = categoryPalette(isDark);
  return data.map((datum, index) => (datum.tone ? toneColor(datum.tone, isDark) : palette[index % palette.length]));
}

export function gridColor(isDark: boolean): string {
  return isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(100, 116, 139, 0.14)';
}

export function tickColor(isDark: boolean): string {
  return isDark ? '#94a3b8' : '#64748b';
}

export const CHART_FONT_FAMILY = "'Inter', 'Segoe UI', Arial, sans-serif";

/** Compact rupee formatter for axes/tooltips (₹K / ₹L / ₹Cr). */
export function inrCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const abs = Math.abs(value);

  if (abs >= 10000000) {
    return `₹${(value / 10000000).toFixed(abs >= 100000000 ? 0 : 1)}Cr`;
  }

  if (abs >= 100000) {
    return `₹${(value / 100000).toFixed(abs >= 1000000 ? 0 : 1)}L`;
  }

  if (abs >= 1000) {
    return `₹${(value / 1000).toFixed(abs >= 100000 ? 0 : 1)}K`;
  }

  return `₹${Math.round(value)}`;
}

export function inrFull(value: number): string {
  return currencyINR(value);
}

/** Tooltip visual defaults shared across charts. */
export function tooltipStyle(isDark: boolean): Record<string, unknown> {
  return {
    backgroundColor: isDark ? '#171728' : '#0f1020',
    titleColor: '#ffffff',
    bodyColor: isDark ? '#e9e9f2' : '#e9e9f2',
    borderColor: isDark ? 'rgba(167,139,250,0.3)' : 'rgba(124,58,237,0.3)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10,
    displayColors: true,
    boxPadding: 4,
  };
}
