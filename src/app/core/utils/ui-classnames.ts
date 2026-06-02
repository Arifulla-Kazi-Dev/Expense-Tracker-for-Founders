import { Direction, PaymentStatus, Tone } from '../models/dashboard.models';

export function tonePanelClass(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
    case 'sky':
      return 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20';
    case 'amber':
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
    case 'rose':
      return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
    case 'slate':
      return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-200 dark:ring-slate-600';
    default:
      return 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-400/10 dark:text-teal-200 dark:ring-teal-400/20';
  }
}

export function progressClass(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500 dark:bg-emerald-300';
    case 'sky':
      return 'bg-sky-500 dark:bg-sky-300';
    case 'amber':
      return 'bg-amber-500 dark:bg-amber-300';
    case 'rose':
      return 'bg-rose-500 dark:bg-rose-300';
    case 'slate':
      return 'bg-slate-500 dark:bg-slate-300';
    default:
      return 'bg-teal-500 dark:bg-teal-300';
  }
}

export function softTextClass(tone: Tone): string {
  switch (tone) {
    case 'emerald':
      return 'text-emerald-600 dark:text-emerald-300';
    case 'sky':
      return 'text-sky-600 dark:text-sky-300';
    case 'amber':
      return 'text-amber-600 dark:text-amber-300';
    case 'rose':
      return 'text-rose-600 dark:text-rose-300';
    case 'slate':
      return 'text-slate-600 dark:text-slate-300';
    default:
      return 'text-teal-600 dark:text-teal-300';
  }
}

export function badgeClass(status: PaymentStatus | 'Active' | 'Draft' | 'Ready' | 'Inactive'): string {
  switch (status) {
    case 'Paid':
    case 'Active':
    case 'Ready':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20';
    case 'Partially Paid':
      return 'bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/20';
    case 'Draft':
    case 'Inactive':
      return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600';
    default:
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
  }
}

export function priorityClass(priority: 'High' | 'Medium' | 'Low'): string {
  switch (priority) {
    case 'High':
      return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
    case 'Medium':
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600';
  }
}

export function directionIcon(direction: Direction): string {
  return direction === 'down' ? 'arrow-down-right' : 'arrow-up-right';
}

export function directionClass(direction: Direction): string {
  if (direction === 'down') {
    return 'text-emerald-600 dark:text-emerald-300';
  }

  if (direction === 'up') {
    return 'text-teal-600 dark:text-teal-300';
  }

  return 'text-slate-500 dark:text-slate-300';
}
