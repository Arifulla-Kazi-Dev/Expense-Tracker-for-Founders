import type { FieldValue, Timestamp } from '@angular/fire/firestore';
import type { UserRole } from './role.model';

export type FirestoreDate = Timestamp | FieldValue | Date | string | null;

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  role: UserRole;
  companyName: string;
  defaultCompanyId?: string;
  activeCompanyId?: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  lastLoginAt: FirestoreDate;
  legacyDataMigratedAt?: FirestoreDate;
}
