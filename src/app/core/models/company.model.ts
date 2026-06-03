import type { FirestoreDate } from './user-profile.model';
import type { UserRole } from './role.model';

export type CompanyPlan = 'free';
export type CompanyMemberStatus = 'active' | 'invited' | 'suspended';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface Company {
  companyId: string;
  companyName: string;
  createdBy: string;
  ownerUid: string;
  plan: CompanyPlan;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  isActive: boolean;
}

export interface CompanyMember {
  id?: string;
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  role: UserRole;
  status: CompanyMemberStatus;
  invitedBy: string;
  joinedAt: FirestoreDate;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
  inviteId?: string;
}

export interface CompanyInvite {
  id?: string;
  inviteId: string;
  companyId: string;
  companyName: string;
  token: string;
  role: UserRole;
  invitedEmail?: string;
  invitedPhone?: string;
  invitedByUid: string;
  invitedByName: string;
  status: InviteStatus;
  expiresAt: FirestoreDate;
  createdAt: FirestoreDate;
  acceptedAt?: FirestoreDate;
  acceptedByUid?: string;
}

export interface CreateInviteInput {
  role: UserRole;
  invitedEmail?: string;
  invitedPhone?: string;
  expiryDays: number;
}
