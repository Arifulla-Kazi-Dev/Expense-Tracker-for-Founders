export type CycleUnit = 'Monthly' | 'Quarterly' | 'Yearly';

export interface DueCyclesResult {
  dueDates: string[];
  nextDate: string;
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function advanceCycle(value: string, cycle: CycleUnit): string {
  const date = parseIsoDate(value) ?? new Date();

  if (cycle === 'Quarterly') {
    date.setMonth(date.getMonth() + 3);
  } else if (cycle === 'Yearly') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return toIsoDate(date);
}

/**
 * Pure catch-up math: given a starting date and how far behind it can be,
 * returns every cycle that's now due (dated to when each cycle was actually
 * due, not "today") plus where the cursor should land afterward. Capped so a
 * stale or bad date can't generate unbounded results.
 */
export function computeDueDates(startDate: string, cycle: CycleUnit, today: string, maxCycles: number): DueCyclesResult {
  const dueDates: string[] = [];
  let cursor = startDate;
  let iterations = 0;

  while (cursor && cursor <= today && iterations < maxCycles) {
    dueDates.push(cursor);
    cursor = advanceCycle(cursor, cycle);
    iterations += 1;
  }

  return { dueDates, nextDate: cursor };
}
