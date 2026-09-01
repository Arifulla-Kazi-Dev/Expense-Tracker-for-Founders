import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  collectionSnapshots,
  doc,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { CompanyMember, CompanyMemberStatus } from '../models/company.model';
import { PermissionOverrides, UserRole, normalizeUserRole } from '../models/role.model';
import { CompanyService } from './company.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly firestore = inject(Firestore);
  private readonly companyService = inject(CompanyService);
  private readonly permissionService = inject(PermissionService);
  private readonly environmentInjector = inject(EnvironmentInjector);

  readonly members$: Observable<CompanyMember[]> = this.companyService.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId) {
        return of([]);
      }

      return runInInjectionContext(this.environmentInjector, () => {
        const membersRef = collection(this.firestore, `companies/${companyId}/members`);
        return collectionSnapshots(query(membersRef, orderBy('createdAt', 'asc'))).pipe(
          map((snapshots) => snapshots.map((snapshot) => normalizeMember(snapshot.id, snapshot.data()))),
          catchError((error) => {
            console.error('Members load failed', error);
            return of([]);
          }),
        );
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  canManageMembers(): boolean {
    return this.permissionService.can('manageMembers');
  }

  async changeRole(member: CompanyMember, role: UserRole): Promise<void> {
    if (role === 'founder' && this.permissionService.currentRole !== 'founder') {
      throw new Error('Only the founder can assign founder ownership.');
    }

    const batch = writeBatch(this.firestore);
    const update = {
      role,
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = this.membershipPayload(member, update);

    batch.update(this.memberDoc(member.uid), update);
    batch.set(this.membershipDoc(member.uid), membershipPayload, { merge: true });

    await batch.commit();
  }

  async suspend(member: CompanyMember): Promise<void> {
    const batch = writeBatch(this.firestore);
    const update = {
      status: 'suspended',
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = this.membershipPayload(member, update);

    batch.update(this.memberDoc(member.uid), update);
    batch.set(this.membershipDoc(member.uid), membershipPayload, { merge: true });

    await batch.commit();
  }

  async updatePermissionOverrides(member: CompanyMember, permissionOverrides: PermissionOverrides): Promise<void> {
    const batch = writeBatch(this.firestore);
    const update = {
      permissionOverrides,
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = this.membershipPayload(member, update);

    batch.update(this.memberDoc(member.uid), update);
    batch.set(this.membershipDoc(member.uid), membershipPayload, { merge: true });

    await batch.commit();
  }

  async remove(uid: string, role: UserRole): Promise<void> {
    if (role === 'founder') {
      throw new Error('Founder cannot be removed.');
    }

    const batch = writeBatch(this.firestore);
    batch.delete(this.memberDoc(uid));
    batch.delete(this.membershipDoc(uid));

    await batch.commit();
  }

  private memberDoc(uid: string) {
    return doc(this.firestore, `companies/${this.companyService.requireActiveCompanyId()}/members/${uid}`);
  }

  private membershipDoc(uid: string) {
    return doc(this.firestore, `users/${uid}/memberships/${this.companyService.requireActiveCompanyId()}`);
  }

  private membershipPayload(member: CompanyMember, update: Record<string, unknown>): Record<string, unknown> {
    const companyId = this.companyService.requireActiveCompanyId();

    return {
      uid: member.uid,
      userId: member.userId ?? member.uid,
      companyId,
      companyName: member.companyName ?? '',
      name: member.name ?? 'Member',
      email: member.email ?? null,
      photoURL: member.photoURL ?? null,
      role: member.role ?? 'team-member',
      status: member.status ?? 'active',
      invitedBy: member.invitedBy ?? '',
      permissionOverrides: member.permissionOverrides ?? {},
      joinedAt: member.joinedAt ?? serverTimestamp(),
      createdAt: member.createdAt ?? serverTimestamp(),
      ...update,
    };
  }
}

function normalizeMember(uid: string, value: Record<string, unknown>): CompanyMember {
  return {
    id: uid,
    uid,
    userId: (value['userId'] as string | undefined) ?? uid,
    companyId: value['companyId'] as string | undefined,
    companyName: value['companyName'] as string | undefined,
    name: (value['name'] as string | undefined) ?? 'Member',
    email: (value['email'] as string | null | undefined) ?? null,
    photoURL: (value['photoURL'] as string | null | undefined) ?? null,
    role: normalizeUserRole(value['role']),
    status: normalizeStatus(value['status']),
    invitedBy: (value['invitedBy'] as string | undefined) ?? '',
    joinedAt: value['joinedAt'] as CompanyMember['joinedAt'],
    createdAt: value['createdAt'] as CompanyMember['createdAt'],
    updatedAt: value['updatedAt'] as CompanyMember['updatedAt'],
    inviteId: value['inviteId'] as string | undefined,
    permissionOverrides: value['permissionOverrides'] as PermissionOverrides | undefined,
  };
}

function normalizeStatus(value: unknown): CompanyMemberStatus {
  const normalized = String(value ?? '').toLowerCase();

  if (normalized === 'invited' || normalized === 'suspended') {
    return normalized;
  }

  return 'active';
}
