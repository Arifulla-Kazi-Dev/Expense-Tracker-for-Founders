import { Injectable, inject } from '@angular/core';
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

import { CompanyMember } from '../models/company.model';
import { PermissionOverrides, UserRole } from '../models/role.model';
import { CompanyService } from './company.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private readonly firestore = inject(Firestore);
  private readonly companyService = inject(CompanyService);
  private readonly permissionService = inject(PermissionService);

  readonly members$: Observable<CompanyMember[]> = this.companyService.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId) {
        return of([]);
      }

      const membersRef = collection(this.firestore, `companies/${companyId}/members`);
      return collectionSnapshots(query(membersRef, orderBy('createdAt', 'asc'))).pipe(
        map((snapshots) => snapshots.map((snapshot) => ({ ...snapshot.data(), uid: snapshot.id }) as CompanyMember)),
        catchError((error) => {
          console.error('Members load failed', error);
          return of([]);
        }),
      );
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
