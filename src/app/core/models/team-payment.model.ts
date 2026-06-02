import type { PaymentStatus } from './expense.model';
import type { FirestoreDate } from './user-profile.model';

export type TeamPaymentType = 'Intern' | 'Employee' | 'Freelancer' | 'Consultant';
export type TeamCompensationType = 'Paid' | 'Unpaid';

export const TEAM_PAYMENT_TYPES: TeamPaymentType[] = ['Intern', 'Employee', 'Freelancer', 'Consultant'];
export const TEAM_COMPENSATION_TYPES: TeamCompensationType[] = ['Paid', 'Unpaid'];

export interface TeamPayment {
  id: string;
  uid: string;
  personName: string;
  role: string;
  type: TeamPaymentType;
  paymentType: TeamCompensationType;
  month: string;
  monthlyAmount: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: PaymentStatus;
  paymentDate: string;
  notes: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type TeamPaymentInput = Omit<TeamPayment, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
