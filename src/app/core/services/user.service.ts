import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { Observable, firstValueFrom, take } from 'rxjs';

import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly firestore = inject(Firestore);
  private readonly permissionService = inject(PermissionService);

  readonly profile$ = this.authService.profile$;

  getProfile(uid: string): Observable<UserProfile> {
    return docData(doc(this.firestore, `users/${uid}`), { idField: 'uid' }) as Observable<UserProfile>;
  }

  async updateProfile(profile: Partial<Pick<UserProfile, 'companyName' | 'name' | 'photoURL'>>): Promise<void> {
    const uid = this.authService.currentUser?.uid;

    if (!uid) {
      throw new Error('You must be signed in to update your profile.');
    }

    const currentProfile = await firstValueFrom(this.profile$.pipe(take(1)));
    const companyId = this.permissionService.activeCompanyId ?? currentProfile?.activeCompanyId ?? currentProfile?.defaultCompanyId;
    const canRenameCompany = this.permissionService.can('manageCompany');
    const requestedCompanyName = profile.companyName?.trim();
    const currentCompanyName = currentProfile?.companyName ?? '';
    const name = profile.name?.trim() || currentProfile?.name || 'Member';

    if (requestedCompanyName && requestedCompanyName !== currentCompanyName) {
      if (!canRenameCompany) {
        throw new Error('Only the founder or a company admin can change the company name.');
      }

      await this.companyService.updateCompanyProfile(requestedCompanyName);
    }

    const payload: Record<string, unknown> = {
      uid,
      name,
      updatedAt: serverTimestamp(),
    };

    if ('photoURL' in profile) {
      payload['photoURL'] = profile.photoURL ?? null;
    }

    if (requestedCompanyName && canRenameCompany) {
      payload['companyName'] = requestedCompanyName;
    }

    const batch = writeBatch(this.firestore);
    const memberPayload: Record<string, unknown> = {
      name,
      updatedAt: serverTimestamp(),
    };

    if ('photoURL' in profile) {
      memberPayload['photoURL'] = profile.photoURL ?? null;
    }

    if (requestedCompanyName && canRenameCompany) {
      memberPayload['companyName'] = requestedCompanyName;
    }

    batch.set(doc(this.firestore, `users/${uid}`), payload, { merge: true });

    if (companyId) {
      batch.set(doc(this.firestore, `companies/${companyId}/members/${uid}`), memberPayload, { merge: true });
      batch.set(doc(this.firestore, `users/${uid}/memberships/${companyId}`), memberPayload, { merge: true });
    }

    await batch.commit();
  }
}
