import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionSnapshots,
  doc,
  getDoc,
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

  async changeRole(uid: string, role: UserRole): Promise<void> {
    if (role === 'founder' && this.permissionService.currentRole !== 'founder') {
      throw new Error('Only the founder can assign founder ownership.');
    }

    const batch = writeBatch(this.firestore);
    const update = {
      role,
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = await this.membershipPayload(uid, update);

    batch.update(this.memberDoc(uid), update);
    batch.set(this.membershipDoc(uid), membershipPayload, { merge: true });

    await batch.commit();
  }

  async suspend(uid: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const update = {
      status: 'suspended',
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = await this.membershipPayload(uid, update);

    batch.update(this.memberDoc(uid), update);
    batch.set(this.membershipDoc(uid), membershipPayload, { merge: true });

    await batch.commit();
  }

  async updatePermissionOverrides(uid: string, permissionOverrides: PermissionOverrides): Promise<void> {
    const batch = writeBatch(this.firestore);
    const update = {
      permissionOverrides,
      updatedAt: serverTimestamp(),
    };
    const membershipPayload = await this.membershipPayload(uid, update);

    batch.update(this.memberDoc(uid), update);
    batch.set(this.membershipDoc(uid), membershipPayload, { merge: true });

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

  private async membershipPayload(uid: string, update: Record<string, unknown>): Promise<Record<string, unknown>> {
    const companyId = this.companyService.requireActiveCompanyId();
    const snapshot = await getDoc(this.memberDoc(uid));
    const data = snapshot.data() as Partial<CompanyMember> | undefined;

    return {
      uid,
      userId: data?.userId ?? uid,
      companyId,
      companyName: data?.companyName ?? '',
      name: data?.name ?? 'Member',
      email: data?.email ?? null,
      photoURL: data?.photoURL ?? null,
      role: data?.role ?? 'team-member',
      status: data?.status ?? 'active',
      invitedBy: data?.invitedBy ?? '',
      permissionOverrides: data?.permissionOverrides ?? {},
      joinedAt: data?.joinedAt ?? serverTimestamp(),
      createdAt: data?.createdAt ?? serverTimestamp(),
      ...update,
    };
  }
}
