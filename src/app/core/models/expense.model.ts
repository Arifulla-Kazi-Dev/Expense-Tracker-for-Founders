import type { FirestoreDate } from './user-profile.model';
import type { FundingSourceAttribution } from './funding.model';

export type PaymentStatus = 'Paid' | 'Pending' | 'Partially Paid';
export type ExpenseType = 'One-Time' | 'Recurring';

export const PAYMENT_STATUSES: PaymentStatus[] = ['Paid', 'Pending', 'Partially Paid'];
export const EXPENSE_TYPES: ExpenseType[] = ['One-Time', 'Recurring'];
export const EXPENSE_CATEGORIES = [
  'Legal & Compliance',
  'Valuation',
  'Company Registration',
  'Product Development',
  'AI Development Tools',
  'Cloud / Hosting',
  'Marketing',
  'Branding',
  'User Acquisition',
  'Travel',
  'Intern Stipends',
  'Salaries',
  'Office / Workspace',
  'Internet / Utilities',
  'Emergency Buffer',
  'Miscellaneous',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Expense categories that describe the same kind of one-time spend the Startup Costs ledger tracks. */
export const STARTUP_COST_EXPENSE_CATEGORIES: ExpenseCategory[] = ['Legal & Compliance', 'Valuation', 'Company Registration'];

export interface Expense extends FundingSourceAttribution {
  id: string;
  uid: string;
  title: string;
  amount: number;
  category: ExpenseCategory | string;
  paymentStatus: PaymentStatus;
  expenseType: ExpenseType;
  date: string;
  dueDate: string;
  paidAmount: number;
  pendingAmount: number;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type ExpenseInput = Omit<Expense, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
