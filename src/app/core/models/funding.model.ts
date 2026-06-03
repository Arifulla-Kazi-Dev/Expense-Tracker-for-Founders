import type { FirestoreDate } from './user-profile.model';

export type FundingType =
  | 'Grant'
  | 'Pre-seed'
  | 'Seed'
  | 'Angel'
  | 'Venture Capital'
  | 'Loan'
  | 'Bank Credit'
  | 'Personal'
  | 'Friends & Family'
  | 'Revenue'
  | 'Customer Advance'
  | 'Crowdfunding'
  | 'Accelerator'
  | 'Other';

export const FUNDING_TYPES: FundingType[] = [
  'Grant',
  'Pre-seed',
  'Seed',
  'Angel',
  'Venture Capital',
  'Loan',
  'Bank Credit',
  'Personal',
  'Friends & Family',
  'Revenue',
  'Customer Advance',
  'Crowdfunding',
  'Accelerator',
  'Other',
];

export interface FundingSourceAttribution {
  fundingSourceId?: string;
  fundingSourceName?: string;
  fundingSourceType?: FundingType | string;
}

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
