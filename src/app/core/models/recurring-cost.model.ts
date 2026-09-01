import type { FirestoreDate } from './user-profile.model';
import type { FundingSourceAttribution } from './funding.model';

export type BillingCycle = 'Monthly' | 'Quarterly' | 'Yearly';

export const BILLING_CYCLES: BillingCycle[] = ['Monthly', 'Quarterly', 'Yearly'];

export interface RecurringCost extends FundingSourceAttribution {
  id: string;
  uid: string;
  name: string;
  amount: number;
  billingCycle: BillingCycle;
  category: string;
  nextBillingDate: string;
  lastBilledDate?: string;
  isActive: boolean;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type RecurringCostInput = Omit<RecurringCost, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
