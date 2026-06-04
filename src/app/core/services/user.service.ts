import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, firstValueFrom, take } from 'rxjs';

import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly authService = inject(AuthService);
  private readonly companyService = inject(CompanyService);
  private readonly firestore = inject(Firestore);

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

    if (profile.companyName) {
      await this.companyService.updateCompanyProfile(profile.companyName);
    }

    const payload: Record<string, unknown> = {
      uid,
      name: profile.name,
      companyName: profile.companyName ?? currentProfile?.companyName,
      role: currentProfile?.role ?? 'founder',
      updatedAt: serverTimestamp(),
    };

    if ('photoURL' in profile) {
      payload['photoURL'] = profile.photoURL ?? null;
    }

    await setDoc(doc(this.firestore, `users/${uid}`), payload, { merge: true });
  }
}
