import type { FirestoreDate } from './user-profile.model';

export type FounderNotePriority = 'Low' | 'Medium' | 'High';

export const FOUNDER_NOTE_PRIORITIES: FounderNotePriority[] = ['Low', 'Medium', 'High'];

export interface FounderNote {
  id: string;
  uid: string;
  title: string;
  relatedExpenseId?: string;
  decisionReason: string;
  expectedBenefit: string;
  priority: FounderNotePriority;
  roiExpectation: string;
  date: string;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type FounderNoteInput = Omit<FounderNote, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
