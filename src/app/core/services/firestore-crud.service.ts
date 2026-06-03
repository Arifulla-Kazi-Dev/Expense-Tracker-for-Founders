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
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import type { DocumentData, UpdateData } from '@angular/fire/firestore';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class FirestoreCrudService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);

  list<T>(collectionName: string): Observable<T[]> {
    return this.permissionService.activeCompanyId$.pipe(
      switchMap((companyId) => {
        if (!companyId) {
          return this.legacyList<T>(collectionName);
        }

        const scopedCollection = collection(this.firestore, `companies/${companyId}/${collectionName}`);
        const scopedQuery = query(scopedCollection, orderBy('createdAt', 'desc'));
        return collectionSnapshots(scopedQuery).pipe(
          map((snapshots) =>
            snapshots
              .filter((snapshot) => !snapshot.metadata.hasPendingWrites)
              .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as T),
          ),
          switchMap((records) => records.length ? of(records) : this.legacyList<T>(collectionName)),
          catchError((error) => {
            console.error('Firestore list failed', error);
            return this.legacyList<T>(collectionName);
          }),
        );
      }),
    );
  }

  async create<T extends object>(collectionName: string, data: T): Promise<string> {
    const uid = this.requireUid();
    const companyId = this.requireCompanyId();
    const scopedCollection = collection(this.firestore, `companies/${companyId}/${collectionName}`);
    const recordRef = doc(scopedCollection);

    await withTimeout(
      setDoc(recordRef, this.withMetadata(data, uid, companyId, recordRef.id)),
      'Create record timed out. Check that Cloud Firestore is created/enabled and rules allow companies/{companyId} writes.',
    );

    return recordRef.id;
  }

  async update<T extends object>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    this.requireUid();
    const companyId = this.requireCompanyId();
    const recordRef = doc(this.firestore, `companies/${companyId}/${collectionName}/${id}`);

    const updateData = this.sanitize({
      ...data,
      updatedAt: serverTimestamp(),
    }) as UpdateData<DocumentData>;

    await withTimeout(
      updateDoc(recordRef, updateData),
      'Update record timed out. Check that Cloud Firestore is created/enabled and rules allow companies/{companyId} writes.',
    );
  }

  async delete(collectionName: string, id: string): Promise<void> {
    this.requireUid();
    const companyId = this.requireCompanyId();
    await withTimeout(
      deleteDoc(doc(this.firestore, `companies/${companyId}/${collectionName}/${id}`)),
      'Delete record timed out. Check that Cloud Firestore is created/enabled and rules allow companies/{companyId} writes.',
    );
  }

  private withMetadata<T extends object>(data: T, uid: string, companyId: string, id: string): Record<string, unknown> {
    return this.sanitize({
      ...data,
      id,
      uid,
      companyId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  private sanitize(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined));
  }

  private requireUid(): string {
    const uid = this.authService.currentUser?.uid;

    if (!uid) {
      throw new Error('You must be signed in to manage finance records.');
    }

    return uid;
  }

  private requireCompanyId(): string {
    const companyId = this.permissionService.activeCompanyId;

    if (!companyId) {
      throw new Error('No active company workspace is selected.');
    }

    return companyId;
  }

  private legacyList<T>(collectionName: string): Observable<T[]> {
    const uid = this.authService.currentUser?.uid;

    if (!uid) {
      return of([]);
    }

    return collectionSnapshots(collection(this.firestore, `users/${uid}/${collectionName}`)).pipe(
      map((snapshots) =>
        snapshots
          .filter((snapshot) => !snapshot.metadata.hasPendingWrites)
          .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as T),
      ),
      catchError((error) => {
        console.error('Legacy Firestore list failed', error);
        return of([]);
      }),
    );
  }
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(new Error(readableFirestoreError(error)));
      });
  });
}

function readableFirestoreError(error: unknown): string {
  const errorWithCode = error as { code?: string; message?: string };
  const message = `${errorWithCode.code ?? ''} ${errorWithCode.message ?? ''}`.trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('not-found') || normalized.includes('404')) {
    return 'Cloud Firestore database was not found for this Firebase project. Create the Firestore database in Firebase Console, then publish the app rules.';
  }

  if (normalized.includes('permission-denied') || normalized.includes('insufficient permissions')) {
    return 'Firestore rejected the write. Publish the rules from firestore.rules so company members can write only inside their workspace.';
  }

  if (normalized.includes('offline') || normalized.includes('unavailable')) {
    return 'Firestore is unreachable from this browser. Check Firestore is enabled and that firestore.googleapis.com is not blocked.';
  }

  return message || 'Firestore write failed.';
}
