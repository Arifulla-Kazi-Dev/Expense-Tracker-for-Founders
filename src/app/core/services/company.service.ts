import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { Company } from '../models/company.model';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);

  readonly activeCompanyId$ = this.permissionService.activeCompanyId$;

  readonly activeCompany$: Observable<Company | null> = this.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId) {
        return of(null);
      }

      return (docData(doc(this.firestore, `companies/${companyId}`), { idField: 'companyId' }) as Observable<Company>).pipe(
        catchError((error) => {
          console.error('Company load failed', error);
          return of(null);
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  companyName$ = this.activeCompany$.pipe(
    map((company) => company?.companyName ?? ''),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  requireActiveCompanyId(): string {
    const companyId = this.permissionService.activeCompanyId;

    if (!companyId) {
      throw new Error('No active company workspace is selected.');
    }

    return companyId;
  }

  async updateCompanyProfile(companyName: string): Promise<void> {
    const user = this.authService.currentUser;
    const companyId = this.requireActiveCompanyId();

    if (!user) {
      throw new Error('You must be signed in to update company settings.');
    }

    await setDoc(doc(this.firestore, `companies/${companyId}`), {
      companyId,
      companyName,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(this.firestore, `users/${user.uid}`), {
      uid: user.uid,
      companyName,
      activeCompanyId: companyId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}
