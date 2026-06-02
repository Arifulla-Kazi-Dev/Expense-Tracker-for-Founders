import type { FieldValue, Timestamp } from '@angular/fire/firestore';

export type FirestoreDate = Timestamp | FieldValue | Date | string | null;

export type UserRole = 'founder' | 'cofounder' | 'accountant' | 'viewer' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  role: UserRole;
  companyName: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  lastLoginAt: FirestoreDate;
}
