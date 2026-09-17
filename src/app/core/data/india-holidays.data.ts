import { toIsoDate } from '../utils/date-cycles';

export interface HolidaySeed {
  date: string;
  name: string;
}

/**
 * Pan-India gazetted public holidays. Republic Day, Independence Day, Gandhi
 * Jayanti and Christmas are fixed every year. Good Friday is computed below.
 * The festival dates (Holi, Eid, Diwali, etc.) follow the lunar Hindu/Islamic
 * calendars and are taken from commonly published national holiday
 * calendars — moon-sighting can shift a couple of these by a day, so verify
 * against your state's official list before relying on it for payroll. Add a
 * year here once its calendar is published; years without an entry fall back
 * to just the fixed-date holidays via `holidaysForYear`.
 */
export const INDIA_PUBLIC_HOLIDAYS: Record<number, HolidaySeed[]> = {
  2025: [
    { date: '2025-01-26', name: 'Republic Day' },
    { date: '2025-03-14', name: 'Holi' },
    { date: '2025-03-31', name: 'Eid al-Fitr' },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-05-12', name: 'Buddha Purnima' },
    { date: '2025-06-07', name: 'Eid al-Adha (Bakrid)' },
    { date: '2025-07-06', name: 'Muharram' },
    { date: '2025-08-15', name: 'Independence Day' },
    { date: '2025-08-16', name: 'Janmashtami' },
    { date: '2025-09-05', name: 'Eid-e-Milad' },
    { date: '2025-10-02', name: 'Gandhi Jayanti / Dussehra' },
    { date: '2025-10-20', name: 'Diwali' },
    { date: '2025-11-05', name: 'Guru Nanak Jayanti' },
    { date: '2025-12-25', name: 'Christmas' },
  ],
  2026: [
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-03-04', name: 'Holi' },
    { date: '2026-03-20', name: 'Eid al-Fitr' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-05-01', name: 'Buddha Purnima' },
    { date: '2026-05-27', name: 'Eid al-Adha (Bakrid)' },
    { date: '2026-06-26', name: 'Muharram' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-08-26', name: 'Eid-e-Milad' },
    { date: '2026-09-04', name: 'Janmashtami' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-10-20', name: 'Dussehra' },
    { date: '2026-11-08', name: 'Diwali' },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti' },
    { date: '2026-12-25', name: 'Christmas' },
  ],
};

/**
 * The four fixed-date national holidays plus Good Friday (computed from the
 * Easter algorithm, so it's exact for any year), used as a fallback for years
 * that don't have a curated festival list above yet.
 */
export function fixedNationalHolidays(year: number): HolidaySeed[] {
  return [
    { date: `${year}-01-26`, name: 'Republic Day' },
    { date: goodFridayDate(year), name: 'Good Friday' },
    { date: `${year}-08-15`, name: 'Independence Day' },
    { date: `${year}-10-02`, name: 'Gandhi Jayanti' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function holidaysForYear(year: number): HolidaySeed[] {
  return INDIA_PUBLIC_HOLIDAYS[year] ?? fixedNationalHolidays(year);
}

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter Sunday, minus two days. */
function goodFridayDate(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easterSunday = new Date(year, month - 1, day);
  easterSunday.setDate(easterSunday.getDate() - 2);
  return toIsoDate(easterSunday);
}
