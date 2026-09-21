import type { FirestoreDate } from './user-profile.model';

export type LeaveType = 'Sick' | 'Casual' | 'Paid' | 'Unpaid' | 'Other';

export const LEAVE_TYPES: LeaveType[] = ['Sick', 'Casual', 'Paid', 'Unpaid', 'Other'];

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  uid: string;
  memberName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type LeaveRequestInput = Pick<LeaveRequest, 'leaveType' | 'startDate' | 'endDate' | 'reason'>;
