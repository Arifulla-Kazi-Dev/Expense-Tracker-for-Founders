import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
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
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

@Injectable({ providedIn: 'root' })
export class FirestoreCrudService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly environmentInjector = inject(EnvironmentInjector);

  /**
   * One shared realtime stream per collection. The dashboard summary, the shell
   * and the matching feature page all read the same collections, so without this
   * cache each subscriber would open its own Firestore listener (duplicate reads).
   * The inner switchMap on activeCompanyId$ keeps the stream correct across
   * company switches, while shareReplay({ refCount: true }) tears the listener
   * down once nothing is subscribed.
   */
  private readonly listCache = new Map<string, Observable<unknown[]>>();

  list<T>(collectionName: string): Observable<T[]> {
    const cached = this.listCache.get(collectionName);

    if (cached) {
      return cached as Observable<T[]>;
    }

    const stream = this.permissionService.activeCompanyId$.pipe(
      switchMap((companyId) => {
        if (!companyId) {
          return of([] as T[]);
        }

        return this.runInFirebaseContext(() => {
          const scopedCollection = collection(this.firestore, `companies/${companyId}/${collectionName}`);
          const scopedQuery = query(scopedCollection, orderBy('createdAt', 'desc'));
          return collectionSnapshots(scopedQuery).pipe(
            map((snapshots) =>
              snapshots
                .filter((snapshot) => !snapshot.metadata.hasPendingWrites)
                .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as T),
            ),
            catchError((error) => {
              console.error('Cloud list failed', error);
              return of([] as T[]);
            }),
          );
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.listCache.set(collectionName, stream as Observable<unknown[]>);
    return stream;
  }

  async create<T extends object>(collectionName: string, data: T): Promise<string> {
    const uid = this.requireUid();
    const companyId = this.requireCompanyId();

    return this.runInFirebaseContext(async () => {
      const scopedCollection = collection(this.firestore, `companies/${companyId}/${collectionName}`);
      const recordRef = doc(scopedCollection);

      await withTimeout(
        setDoc(recordRef, this.withMetadata(data, uid, companyId, recordRef.id)),
        'Create record timed out. Check that the Cloud database is enabled and access rules allow company writes.',
      );

      return recordRef.id;
    });
  }

  async update<T extends object>(collectionName: string, id: string, data: Partial<T>): Promise<void> {
    this.requireUid();
    const companyId = this.requireCompanyId();

    return this.runInFirebaseContext(async () => {
      const recordRef = doc(this.firestore, `companies/${companyId}/${collectionName}/${id}`);

      const updateData = this.sanitize({
        ...data,
        updatedAt: serverTimestamp(),
      }) as UpdateData<DocumentData>;

      await withTimeout(
        updateDoc(recordRef, updateData),
        'Update record timed out. Check that the Cloud database is enabled and access rules allow company writes.',
      );
    });
  }

  async delete(collectionName: string, id: string): Promise<void> {
    this.requireUid();
    const companyId = this.requireCompanyId();

    return this.runInFirebaseContext(async () => {
      await withTimeout(
        deleteDoc(doc(this.firestore, `companies/${companyId}/${collectionName}/${id}`)),
        'Delete record timed out. Check that the Cloud database is enabled and access rules allow company writes.',
      );
    });
  }

  private runInFirebaseContext<T>(operation: () => T): T {
    return runInInjectionContext(this.environmentInjector, operation);
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
    return 'Cloud database was not found for this project. Enable the database, then publish the app access rules.';
  }

  if (normalized.includes('permission-denied') || normalized.includes('insufficient permissions')) {
    return 'Cloud rejected the write. Publish the access rules so company members can write only inside their workspace.';
  }

  if (normalized.includes('offline') || normalized.includes('unavailable')) {
    return 'Cloud data is unreachable from this browser. Check the database is enabled and that data requests are not blocked.';
  }

  return cleanBackendTerms(message) || 'Cloud write failed.';
}

function cleanBackendTerms(message: string): string {
  return message
    .replace(/Firebase:\s*/gi, '')
    .replace(/FirebaseError:\s*/gi, '')
    .replace(/Cloud Firestore/gi, 'Cloud database')
    .replace(/Firestore/gi, 'Cloud');
}
