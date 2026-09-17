import type { FirestoreDate } from './user-profile.model';

export interface Holiday {
  id: string;
  uid: string;
  date: string;
  name: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export type HolidayInput = Omit<Holiday, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;

export interface AttendanceToken {
  date: string;
  token: string;
  generatedAt: FirestoreDate;
  generatedBy: string;
}

export interface AttendanceRecord {
  id: string;
  uid: string;
  memberName: string;
  date: string;
  tokenSubmitted: string;
  markedAt: FirestoreDate;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  /** Set when a founder/co-founder/HR manager marked this day present directly, instead of the member checking in themselves. */
  markedBy?: string;
}

export type AttendanceDayStatus = 'Present' | 'Absent' | 'Holiday' | 'Weekend' | 'Future';
