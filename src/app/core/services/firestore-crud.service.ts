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

@Injectable({ providedIn: 'root' })
export class FirestoreCrudService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);

  list<T>(collectionName: string): Observable<T[]> {
    return this.authService.uid$.pipe(
      switchMap((uid) => {
        if (!uid) {
          return of([]);
        }

        const scopedCollection = collection(this.firestore, `users/${uid}/${collectionName}`);
        const scopedQuery = query(scopedCollection, orderBy('createdAt', 'desc'));
        return collectionSnapshots(scopedQuery).pipe(
          map((snapshots) =>
            snapshots
              .filter((snapshot) => !snapshot.metadata.hasPendingWrites)
              .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as T),
          ),
          catchError((error) => {
            console.error('Firestore list failed', error);
            return of([]);
          }),
        );
      }),
    );
  }

  async create<T extends object>(collectionName: string, data: T): Promise<string> {
    const uid = this.requireUid();
    const scopedCollection = collection(this.firestore, `users/${uid}/${collectionName}`);
    const recordRef = doc(scopedCollection);

    await withTimeout(
      setDoc(recordRef, this.withMetadata(data, uid, recordRef.id)),
      'Create record timed out. Check that Cloud Firestore is created/enabled and rules allow users/{uid} writes.',
    );

    return recordRef.id;
  }

  async update<T extends object>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    const uid = this.requireUid();
    const recordRef = doc(this.firestore, `users/${uid}/${collectionName}/${id}`);

    const updateData = this.sanitize({
      ...data,
      updatedAt: serverTimestamp(),
    }) as UpdateData<DocumentData>;

    await withTimeout(
      updateDoc(recordRef, updateData),
      'Update record timed out. Check that Cloud Firestore is created/enabled and rules allow users/{uid} writes.',
    );
  }

  async delete(collectionName: string, id: string): Promise<void> {
    const uid = this.requireUid();
    await withTimeout(
      deleteDoc(doc(this.firestore, `users/${uid}/${collectionName}/${id}`)),
      'Delete record timed out. Check that Cloud Firestore is created/enabled and rules allow users/{uid} writes.',
    );
  }

  private withMetadata<T extends object>(data: T, uid: string, id: string): Record<string, unknown> {
    return this.sanitize({
      ...data,
      id,
      uid,
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
    return 'Firestore rejected the write. Publish the rules from firestore.rules so users can write only under users/{uid}.';
  }

  if (normalized.includes('offline') || normalized.includes('unavailable')) {
    return 'Firestore is unreachable from this browser. Check Firestore is enabled and that firestore.googleapis.com is not blocked.';
  }

  return message || 'Firestore write failed.';
}
