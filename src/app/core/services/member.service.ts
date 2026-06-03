import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionSnapshots,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { CompanyMember } from '../models/company.model';
import { UserRole } from '../models/role.model';
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

    await updateDoc(this.memberDoc(uid), {
      role,
      updatedAt: serverTimestamp(),
    });
  }

  async suspend(uid: string): Promise<void> {
    await updateDoc(this.memberDoc(uid), {
      status: 'suspended',
      updatedAt: serverTimestamp(),
    });
  }

  async remove(uid: string, role: UserRole): Promise<void> {
    if (role === 'founder') {
      throw new Error('Founder cannot be removed.');
    }

    await deleteDoc(this.memberDoc(uid));
  }

  private memberDoc(uid: string) {
    return doc(this.firestore, `companies/${this.companyService.requireActiveCompanyId()}/members/${uid}`);
  }
}
