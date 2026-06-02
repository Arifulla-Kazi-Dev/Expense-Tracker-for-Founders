import type { FirestoreDate } from './user-profile.model';

export type FundingType = 'Grant' | 'Pre-seed' | 'Loan' | 'Personal' | 'Revenue' | 'Other';

export const FUNDING_TYPES: FundingType[] = ['Grant', 'Pre-seed', 'Loan', 'Personal', 'Revenue', 'Other'];

export interface Funding {
  id: string;
  uid: string;
  sourceName: string;
  amount: number;
  dateReceived: string;
  type: FundingType;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type FundingInput = Omit<Funding, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
