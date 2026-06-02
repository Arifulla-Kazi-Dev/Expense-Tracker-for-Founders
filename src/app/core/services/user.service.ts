import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly authService = inject(AuthService);
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

    await setDoc(doc(this.firestore, `users/${uid}`), {
      uid,
      ...profile,
      role: 'founder',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}
