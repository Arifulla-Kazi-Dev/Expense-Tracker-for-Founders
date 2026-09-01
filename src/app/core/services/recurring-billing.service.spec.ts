import { DueCyclesResult, MAX_CATCH_UP_CYCLES, computeDueCycles } from './recurring-billing.service';

describe('computeDueCycles', () => {
  it('returns no due cycles when the next billing date is in the future', () => {
    const result = computeDueCycles('2026-10-01', 'Monthly', '2026-09-01');

    expect(result.dueDates).toEqual([]);
    expect(result.nextBillingDate).toBe('2026-10-01');
  });

  it('returns no due cycles when the next billing date is empty', () => {
    const result = computeDueCycles('', 'Monthly', '2026-09-01');

    expect(result.dueDates).toEqual([]);
    expect(result.nextBillingDate).toBe('');
  });

  it('bills exactly one cycle when the next billing date is today', () => {
    const result = computeDueCycles('2026-09-01', 'Monthly', '2026-09-01');

    expect(result.dueDates).toEqual(['2026-09-01']);
    expect(result.nextBillingDate).toBe('2026-10-01');
  });

  it('catches up multiple missed monthly cycles, dated to when each was actually due', () => {
    const result = computeDueCycles('2026-06-01', 'Monthly', '2026-09-01');

    expect(result.dueDates).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
    expect(result.nextBillingDate).toBe('2026-10-01');
  });

  it('advances quarterly cycles by 3 months per charge', () => {
    const result = computeDueCycles('2026-01-01', 'Quarterly', '2026-09-01');

    expect(result.dueDates).toEqual(['2026-01-01', '2026-04-01', '2026-07-01']);
    expect(result.nextBillingDate).toBe('2026-10-01');
  });

  it('advances yearly cycles by 12 months per charge', () => {
    const result = computeDueCycles('2024-09-01', 'Yearly', '2026-09-01');

    expect(result.dueDates).toEqual(['2024-09-01', '2025-09-01', '2026-09-01']);
    expect(result.nextBillingDate).toBe('2027-09-01');
  });

  it('caps catch-up at MAX_CATCH_UP_CYCLES instead of generating unbounded charges', () => {
    // Deliberately pathological input: a recurring cost whose billing date was
    // never advanced for decades (bad data, typo year, etc). Without a cap this
    // is the exact class of bug that froze the app via the dashboard trend loop.
    const result: DueCyclesResult = computeDueCycles('1990-01-01', 'Monthly', '2026-09-01');

    expect(result.dueDates.length).toBe(MAX_CATCH_UP_CYCLES);
    expect(result.dueDates[0]).toBe('1990-01-01');
    // Still behind "today" — a later run continues catching up from here.
    expect(result.nextBillingDate <= '2026-09-01').toBeTrue();
  });

  it('is idempotent once caught up: re-running with the same today produces no further charges', () => {
    const first = computeDueCycles('2026-06-01', 'Monthly', '2026-09-01');
    const second = computeDueCycles(first.nextBillingDate, 'Monthly', '2026-09-01');

    expect(second.dueDates).toEqual([]);
  });
});
