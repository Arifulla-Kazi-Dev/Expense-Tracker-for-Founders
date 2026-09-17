import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

import { Tone } from '../../../core/models/dashboard.models';
import { toIsoDate } from '../../../core/utils/date-cycles';
import { progressClass, tonePanelClass } from '../../../core/utils/ui-classnames';

export interface CalendarMarker {
  date: string;
  tone: Tone;
  label?: string;
  /** When set, tints the whole cell background instead of just adding a dot — for one-state-per-day views like attendance. */
  fill?: boolean;
}

export interface CalendarCell {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  markers: CalendarMarker[];
  fillTone: Tone | null;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-calendar-month',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './calendar-month.component.html',
})
export class CalendarMonthComponent {
  readonly markers = input<CalendarMarker[]>([]);

  @Output() dayClick = new EventEmitter<string>();
  @Output() monthChange = new EventEmitter<{ year: number; month: number }>();

  readonly weekdayLabels = WEEKDAY_LABELS;

  private readonly viewDate = signal(startOfMonth(new Date()));
  private readonly todayIso = toIsoDate(new Date());

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(this.viewDate()),
  );

  readonly weeks = computed<CalendarCell[][]>(() => this.buildWeeks(this.viewDate(), this.markers()));

  readonly isCurrentMonth = computed(() => {
    const now = startOfMonth(new Date());
    const view = this.viewDate();
    return now.getFullYear() === view.getFullYear() && now.getMonth() === view.getMonth();
  });

  previousMonth(): void {
    this.shiftMonth(-1);
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  goToday(): void {
    this.viewDate.set(startOfMonth(new Date()));
    this.emitMonthChange();
  }

  onDayClick(cell: CalendarCell): void {
    if (!cell.inCurrentMonth) {
      return;
    }

    this.dayClick.emit(cell.date);
  }

  markerDotClass(tone: Tone): string {
    return progressClass(tone);
  }

  fillClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  private shiftMonth(delta: number): void {
    const current = this.viewDate();
    this.viewDate.set(new Date(current.getFullYear(), current.getMonth() + delta, 1));
    this.emitMonthChange();
  }

  private emitMonthChange(): void {
    const view = this.viewDate();
    this.monthChange.emit({ year: view.getFullYear(), month: view.getMonth() });
  }

  private buildWeeks(viewDate: Date, markers: CalendarMarker[]): CalendarCell[][] {
    const markersByDate = new Map<string, CalendarMarker[]>();

    markers.forEach((marker) => {
      const list = markersByDate.get(marker.date) ?? [];
      list.push(marker);
      markersByDate.set(marker.date, list);
    });

    const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    const cells: CalendarCell[] = [];
    const cursor = new Date(gridStart);

    for (let index = 0; index < 42; index += 1) {
      const iso = toIsoDate(cursor);
      const dayMarkers = markersByDate.get(iso) ?? [];
      cells.push({
        date: iso,
        day: cursor.getDate(),
        inCurrentMonth: cursor.getMonth() === viewDate.getMonth(),
        isToday: iso === this.todayIso,
        markers: dayMarkers,
        fillTone: dayMarkers.find((marker) => marker.fill)?.tone ?? null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const weeks: CalendarCell[][] = [];

    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    return weeks;
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
