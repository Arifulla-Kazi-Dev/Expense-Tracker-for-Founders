import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, doc, docData, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { AttendanceToken } from '../models/attendance.model';
import { toIsoDate } from '../utils/date-cycles';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class AttendanceTokenService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly environmentInjector = inject(EnvironmentInjector);

  /**
   * Live stream of today's attendance code — resolves to null for anyone
   * without manageAttendance (Firestore rules deny the read outright, so
   * their client never receives the actual value).
   */
  readonly todayToken$: Observable<AttendanceToken | null> = this.permissionService.activeCompanyId$.pipe(
    switchMap((companyId) => {
      if (!companyId || !this.permissionService.can('manageAttendance')) {
        return of(null);
      }

      return runInInjectionContext(this.environmentInjector, () => {
        const date = toIsoDate(new Date());
        return (docData(doc(this.firestore, `companies/${companyId}/attendanceTokens/${date}`)) as Observable<AttendanceToken | undefined>).pipe(
          map((token) => token ?? null),
          catchError(() => of(null)),
        );
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Creates today's code if it doesn't exist yet. Safe to call on every
   * login — it's a no-op once today's token already exists, and silently
   * does nothing for anyone without manageAttendance (generation must stay
   * restricted to those roles: whoever's session writes the value necessarily
   * knows it, so a regular employee's session must never be the one that does).
   */
  async ensureTodayToken(): Promise<void> {
    return runInInjectionContext(this.environmentInjector, () => this.ensureTodayTokenInternal());
  }

  private async ensureTodayTokenInternal(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    const companyId = this.permissionService.activeCompanyId;

    if (!uid || !companyId || !this.permissionService.can('manageAttendance')) {
      return;
    }

    const date = toIsoDate(new Date());
    const ref = doc(this.firestore, `companies/${companyId}/attendanceTokens/${date}`);

    try {
      const snapshot = await getDoc(ref);

      if (snapshot.exists()) {
        return;
      }

      await setDoc(ref, {
        date,
        companyId,
        token: generateToken(),
        generatedAt: serverTimestamp(),
        generatedBy: uid,
      });
    } catch (error) {
      console.error('Attendance token generation failed', error);
    }
  }

  async regenerateToday(): Promise<void> {
    return runInInjectionContext(this.environmentInjector, () => this.regenerateTodayInternal());
  }

  private async regenerateTodayInternal(): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    const companyId = this.permissionService.activeCompanyId;

    if (!uid || !companyId || !this.permissionService.can('manageAttendance')) {
      throw new Error('You do not have permission to manage attendance codes.');
    }

    const date = toIsoDate(new Date());
    const ref = doc(this.firestore, `companies/${companyId}/attendanceTokens/${date}`);

    await setDoc(ref, {
      date,
      companyId,
      token: generateToken(),
      generatedAt: serverTimestamp(),
      generatedBy: uid,
    });
  }
}

function generateToken(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
