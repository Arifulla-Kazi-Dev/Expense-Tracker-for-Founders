import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { Expense } from '../models/expense.model';
import { FounderNote } from '../models/founder-note.model';
import { Funding } from '../models/funding.model';
import { RecurringCostCharge } from '../models/recurring-cost-charge.model';
import { RecurringCost } from '../models/recurring-cost.model';
import { StartupCost } from '../models/startup-cost.model';
import { TeamPayment } from '../models/team-payment.model';
import { DashboardService } from './dashboard.service';
import { ExpenseService } from './expense.service';
import { FounderNoteService } from './founder-note.service';
import { FundingService } from './funding.service';
import { RecurringCostChargeService } from './recurring-cost-charge.service';
import { RecurringCostService } from './recurring-cost.service';
import { StartupCostService } from './startup-cost.service';
import { TeamPaymentService } from './team-payment.service';

const fundingSource: Funding = {
  id: 'f1',
  uid: 'u1',
  sourceName: 'Angel round',
  amount: 100000,
  dateReceived: '2026-01-01',
  type: 'Angel',
  notes: '',
  createdAt: null,
  updatedAt: null,
};

function setup(overrides: {
  funding?: Funding[];
  expenses?: Expense[];
  teamPayments?: TeamPayment[];
  startupCosts?: StartupCost[];
  recurringCosts?: RecurringCost[];
  recurringCostCharges?: RecurringCostCharge[];
  founderNotes?: FounderNote[];
} = {}): DashboardService {
  TestBed.configureTestingModule({
    providers: [
      DashboardService,
      { provide: FundingService, useValue: { list: () => of(overrides.funding ?? []) } },
      { provide: ExpenseService, useValue: { list: () => of(overrides.expenses ?? []) } },
      { provide: TeamPaymentService, useValue: { list: () => of(overrides.teamPayments ?? []) } },
      { provide: StartupCostService, useValue: { list: () => of(overrides.startupCosts ?? []) } },
      { provide: RecurringCostService, useValue: { list: () => of(overrides.recurringCosts ?? []) } },
      { provide: RecurringCostChargeService, useValue: { list: () => of(overrides.recurringCostCharges ?? []) } },
      { provide: FounderNoteService, useValue: { list: () => of(overrides.founderNotes ?? []) } },
    ],
  });

  return TestBed.inject(DashboardService);
}

describe('DashboardService', () => {
  it('reports no data when every collection is empty', async () => {
    const service = setup();
    const summary = await firstValueFrom(service.summary$);

    expect(summary.hasData).toBeFalse();
    expect(summary.totalFunding).toBe(0);
    expect(summary.remainingBalance).toBe(0);
  });

  it('deducts actual recurring-cost charges from Available Cash, not just the projected monthly figure', async () => {
    const recurringCost: RecurringCost = {
      id: 'rc1',
      uid: 'u1',
      name: 'Codex',
      amount: 2000,
      billingCycle: 'Monthly',
      category: 'AI Development Tools',
      nextBillingDate: '2026-10-01',
      isActive: true,
      notes: '',
      createdAt: null,
      updatedAt: null,
      fundingSourceId: fundingSource.id,
      fundingSourceName: fundingSource.sourceName,
      fundingSourceType: fundingSource.type,
    };
    const charge: RecurringCostCharge = {
      id: 'c1',
      uid: 'u1',
      recurringCostId: 'rc1',
      name: 'Codex',
      category: 'AI Development Tools',
      amount: 2000,
      billingCycle: 'Monthly',
      billedDate: '2026-09-01',
      fundingSourceId: fundingSource.id,
      fundingSourceName: fundingSource.sourceName,
      fundingSourceType: fundingSource.type,
      createdAt: null,
      updatedAt: null,
    };

    const service = setup({ funding: [fundingSource], recurringCosts: [recurringCost], recurringCostCharges: [charge] });
    const summary = await firstValueFrom(service.summary$);

    expect(summary.totalPaid).toBe(2000);
    expect(summary.remainingBalance).toBe(100000 - 2000);
  });

  it('attributes funding-source utilization to the real charged amount, not the monthly-equivalent projection', async () => {
    // Quarterly cost: the monthly-equivalent projection would be 3000/3 = 1000,
    // but a single real charge actually cuts the full 3000 from the source.
    const recurringCost: RecurringCost = {
      id: 'rc1',
      uid: 'u1',
      name: 'Annual tool, billed quarterly',
      amount: 3000,
      billingCycle: 'Quarterly',
      category: 'Cloud / Hosting',
      nextBillingDate: '2026-12-01',
      isActive: true,
      notes: '',
      createdAt: null,
      updatedAt: null,
      fundingSourceId: fundingSource.id,
      fundingSourceName: fundingSource.sourceName,
      fundingSourceType: fundingSource.type,
    };
    const charge: RecurringCostCharge = {
      id: 'c1',
      uid: 'u1',
      recurringCostId: 'rc1',
      name: recurringCost.name,
      category: recurringCost.category,
      amount: 3000,
      billingCycle: 'Quarterly',
      billedDate: '2026-09-01',
      fundingSourceId: fundingSource.id,
      fundingSourceName: fundingSource.sourceName,
      fundingSourceType: fundingSource.type,
      createdAt: null,
      updatedAt: null,
    };

    const service = setup({ funding: [fundingSource], recurringCosts: [recurringCost], recurringCostCharges: [charge] });
    const summary = await firstValueFrom(service.summary$);
    const utilization = summary.fundingUtilization.find((item) => item.sourceId === fundingSource.id);

    expect(utilization?.utilized).toBe(3000);
  });

  it('caps the monthly spend trend instead of iterating one point per month back to a stale date', async () => {
    // Regression guard: a recurring cost whose nextBillingDate is wildly old used
    // to make the trend loop walk every month between then and now, unbounded.
    const recurringCost: RecurringCost = {
      id: 'rc1',
      uid: 'u1',
      name: 'Stale test entry',
      amount: 500,
      billingCycle: 'Monthly',
      category: 'Miscellaneous',
      nextBillingDate: '1990-01-01',
      isActive: true,
      notes: '',
      createdAt: null,
      updatedAt: null,
    };

    const service = setup({ recurringCosts: [recurringCost] });
    const summary = await firstValueFrom(service.summary$);

    expect(summary.monthlySpendTrend.length).toBeLessThanOrEqual(121);
  });
});
