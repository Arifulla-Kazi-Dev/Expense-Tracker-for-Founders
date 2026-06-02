import type { PaymentStatus } from './expense.model';
import type { FirestoreDate } from './user-profile.model';

export interface StartupCost {
  id: string;
  uid: string;
  costName: string;
  amount: number;
  paymentStatus: PaymentStatus;
  date: string;
  paidAmount: number;
  pendingAmount: number;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type StartupCostInput = Omit<StartupCost, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
