import type { FirestoreDate } from './user-profile.model';
import type { FundingSourceAttribution } from './funding.model';
import type { BillingCycle } from './recurring-cost.model';

export interface RecurringCostCharge extends FundingSourceAttribution {
  id: string;
  uid: string;
  recurringCostId: string;
  name: string;
  category: string;
  amount: number;
  billingCycle: BillingCycle;
  billedDate: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}
