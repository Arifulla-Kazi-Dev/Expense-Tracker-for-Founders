import type { FirestoreDate } from './user-profile.model';

export type ComplianceCategory = 'Tax' | 'Regulatory' | 'License' | 'Corporate' | 'Other';

export const COMPLIANCE_CATEGORIES: ComplianceCategory[] = ['Tax', 'Regulatory', 'License', 'Corporate', 'Other'];

export type ComplianceRecurrence = 'One-Time' | 'Monthly' | 'Quarterly' | 'Yearly';

export const COMPLIANCE_RECURRENCES: ComplianceRecurrence[] = ['One-Time', 'Monthly', 'Quarterly', 'Yearly'];

/** Expense categories that represent compliance-relevant spend, shown as read-only reference entries on the Compliance page. */
export const COMPLIANCE_LINKED_EXPENSE_CATEGORIES: string[] = ['Legal & Compliance'];

export interface ComplianceItem {
  id: string;
  uid: string;
  title: string;
  category: ComplianceCategory | string;
  dueDate: string;
  recurrence: ComplianceRecurrence;
  completedAt: string | null;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type ComplianceItemInput = Omit<ComplianceItem, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
