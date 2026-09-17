import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, doc, serverTimestamp, setDoc } from '@angular/fire/firestore';

import { AttendanceRecord } from '../models/attendance.model';
import { toIsoDate } from '../utils/date-cycles';
import { AuthService } from './auth.service';
import { FirestoreCrudService } from './firestore-crud.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly crud = inject(FirestoreCrudService);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly collectionName = 'attendance';

  list() {
    return this.crud.list<AttendanceRecord>(this.collectionName);
  }

  /**
   * Submits today's code to mark the signed-in member present. The write
   * either succeeds (code matched, and the doc didn't already exist for
   * today) or is rejected by Firestore rules — there is no in-between and
   * no way for this client to learn the real code either way.
   */
  async checkIn(token: string, memberName: string): Promise<void> {
    return runInInjectionContext(this.environmentInjector, () => this.checkInInternal(token, memberName));
  }

  private async checkInInternal(token: string, memberName: string): Promise<void> {
    const uid = this.authService.currentUser?.uid;
    const companyId = this.permissionService.activeCompanyId;

    if (!uid || !companyId) {
      throw new Error('You must be signed in to mark attendance.');
    }

    const date = toIsoDate(new Date());
    const id = `${uid}_${date}`;
    const ref = doc(this.firestore, `companies/${companyId}/attendance/${id}`);

    try {
      await setDoc(ref, {
        id,
        uid,
        companyId,
        memberName,
        date,
        tokenSubmitted: token.trim(),
        markedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      throw new Error("That code didn't work. Double-check it with your team, or try again in a moment.");
    }
  }

  async delete(id: string): Promise<void> {
    return this.crud.delete(this.collectionName, id);
  }
}
