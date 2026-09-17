import { advanceCycle, computeDueDates } from './date-cycles';

describe('advanceCycle', () => {
  it('advances a month for Monthly', () => {
    expect(advanceCycle('2026-01-15', 'Monthly')).toBe('2026-02-15');
  });

  it('advances three months for Quarterly', () => {
    expect(advanceCycle('2026-01-15', 'Quarterly')).toBe('2026-04-15');
  });

  it('advances a year for Yearly', () => {
    expect(advanceCycle('2026-01-15', 'Yearly')).toBe('2027-01-15');
  });
});

describe('computeDueDates', () => {
  it('returns nothing when the start date is in the future', () => {
    const result = computeDueDates('2026-10-01', 'Monthly', '2026-09-01', 24);

    expect(result.dueDates).toEqual([]);
    expect(result.nextDate).toBe('2026-10-01');
  });

  it('catches up multiple missed cycles, dated to when each was actually due', () => {
    const result = computeDueDates('2026-06-01', 'Monthly', '2026-09-01', 24);

    expect(result.dueDates).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
    expect(result.nextDate).toBe('2026-10-01');
  });

  it('caps catch-up at maxCycles instead of running unbounded', () => {
    const result = computeDueDates('1990-01-01', 'Monthly', '2026-09-01', 24);

    expect(result.dueDates.length).toBe(24);
    expect(result.nextDate <= '2026-09-01').toBeTrue();
  });
});
