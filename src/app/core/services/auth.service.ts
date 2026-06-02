import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  GoogleAuthProvider,
  User,
  authState,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import { Firestore, doc, docData, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, catchError, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';

import { UserProfile } from '../models/user-profile.model';

export interface RegisterCredentials {
  name: string;
  companyName: string;
  email: string;
  password: string;
}

const AUTH_TIMEOUT_MS = 15000;
const PROFILE_SYNC_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  private readonly profileSyncErrorSubject = new BehaviorSubject<string>('');

  readonly user$: Observable<User | null> = authState(this.auth).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly profileSyncError$ = this.profileSyncErrorSubject.asObservable();

  readonly uid$ = this.user$.pipe(
    map((user) => user?.uid ?? null),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly profile$ = this.uid$.pipe(
    switchMap((uid) => {
      if (!uid) {
        return of(null);
      }

      return this.runInFirebaseContext(() =>
        (docData(doc(this.firestore, `users/${uid}`), { idField: 'uid' }) as Observable<UserProfile>).pipe(
        catchError((error) => {
          this.profileSyncErrorSubject.next(readableFirebaseError(error));
          return of(null);
        }),
        ),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  get currentUser(): User | null {
    return this.auth.currentUser;
  }

  constructor() {
    this.user$.pipe(distinctUntilChanged((previous, current) => previous?.uid === current?.uid)).subscribe((user) => {
      if (!user) {
        this.clearProfileSyncError();
        return;
      }

      void this.tryEnsureUserProfile(user);
    });
  }

  async register(credentials: RegisterCredentials): Promise<void> {
    let result: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;

    try {
      result = await withTimeout(
        this.runInFirebaseContext(() => createUserWithEmailAndPassword(this.auth, credentials.email, credentials.password)),
        AUTH_TIMEOUT_MS,
        'Firebase Auth signup is taking too long. Check your connection, Firebase Auth settings, and authorized domains.',
      );
    } catch (error) {
      if (!isEmailAlreadyInUse(error)) {
        throw error;
      }

      result = await withTimeout(
        this.runInFirebaseContext(() => signInWithEmailAndPassword(this.auth, credentials.email, credentials.password)),
        AUTH_TIMEOUT_MS,
        'This account already exists. I tried signing in to repair the profile, but Firebase Auth did not respond.',
      );
    }

    await withTimeout(
      this.runInFirebaseContext(() => updateProfile(result.user, { displayName: credentials.name })),
      PROFILE_SYNC_TIMEOUT_MS,
      'Firebase profile display name update timed out.',
    ).catch((error) => this.profileSyncErrorSubject.next(readableFirebaseError(error)));

    await this.ensureUserProfileWithRetry(result.user, {
      companyName: credentials.companyName,
      includeCreatedAt: true,
      name: credentials.name,
    });
  }

  async login(email: string, password: string): Promise<void> {
    const result = await withTimeout(
      this.runInFirebaseContext(() => signInWithEmailAndPassword(this.auth, email, password)),
      AUTH_TIMEOUT_MS,
      'Firebase Auth login is taking too long. Check your connection and Firebase Auth settings.',
    );

    this.queueUserProfileSync(result.user);
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const result = await withTimeout(
      this.runInFirebaseContext(() => signInWithPopup(this.auth, provider)),
      AUTH_TIMEOUT_MS,
      'Google Sign-In is taking too long. Check popup permissions and Firebase Auth settings.',
    );

    this.queueUserProfileSync(result.user, { includeCreatedAt: true });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.runInFirebaseContext(() => sendPasswordResetEmail(this.auth, email));
  }

  async logout(): Promise<void> {
    await this.runInFirebaseContext(() => signOut(this.auth));
    await this.router.navigateByUrl('/login');
  }

  async retryCurrentUserProfileSync(): Promise<void> {
    const user = this.currentUser;

    if (!user) {
      throw new Error('You must be signed in before retrying profile sync.');
    }

    await this.ensureUserProfileWithRetry(user, { includeCreatedAt: true });
  }

  clearProfileSyncError(): void {
    this.profileSyncErrorSubject.next('');
  }

  async ensureUserProfileWithRetry(
    user: User,
    overrides: Partial<Pick<UserProfile, 'companyName' | 'name'>> & { includeCreatedAt?: boolean } = {},
  ): Promise<void> {
    const attempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await withTimeout(
          this.ensureUserProfile(user, overrides),
          PROFILE_SYNC_TIMEOUT_MS,
          'Firestore profile sync timed out. Check that Cloud Firestore is enabled and rules allow users/{uid} writes.',
        );
        this.clearProfileSyncError();
        return;
      } catch (error) {
        lastError = error;

        if (attempt < attempts) {
          await wait(attempt * 500);
        }
      }
    }

    const message = readableFirebaseError(lastError);
    this.profileSyncErrorSubject.next(message);
    throw new Error(message);
  }

  private async ensureUserProfile(
    user: User,
    overrides: Partial<Pick<UserProfile, 'companyName' | 'name'>> & { includeCreatedAt?: boolean } = {},
  ): Promise<void> {
    const profileRef = doc(this.firestore, `users/${user.uid}`);
    const existingProfile = await this.runInFirebaseContext(() => getDoc(profileRef));
    const existingData = existingProfile.data() as Partial<UserProfile> | undefined;
    const now = serverTimestamp();
    const name = overrides.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'Founder';
    const profile: Record<string, unknown> = {
      uid: user.uid,
      email: user.email,
      photoURL: user.photoURL,
      role: 'founder',
      updatedAt: now,
      lastLoginAt: now,
    };

    if (overrides.name !== undefined || !existingProfile.exists() || !existingData?.name) {
      profile['name'] = name;
    }

    if (overrides.companyName !== undefined) {
      profile['companyName'] = overrides.companyName;
    }

    if (overrides.includeCreatedAt && !existingData?.createdAt) {
      profile['createdAt'] = now;
    }

    await this.runInFirebaseContext(() => setDoc(profileRef, profile, { merge: true }));
  }

  private async tryEnsureUserProfile(
    user: User,
    overrides: Partial<Pick<UserProfile, 'companyName' | 'name'>> & { includeCreatedAt?: boolean } = {},
  ): Promise<void> {
    try {
      await this.ensureUserProfileWithRetry(user, overrides);
    } catch {
      // Auth should not strand the user if profile sync is temporarily unavailable.
      // The shell shows profileSyncError$ and any later Firestore write will retry against the same UID.
    }
  }

  private queueUserProfileSync(
    user: User,
    overrides: Partial<Pick<UserProfile, 'companyName' | 'name'>> & { includeCreatedAt?: boolean } = {},
  ): void {
    void this.tryEnsureUserProfile(user, overrides);
  }

  private runInFirebaseContext<T>(operation: () => T): T {
    return runInInjectionContext(this.environmentInjector, operation);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function readableFirebaseError(error: unknown): string {
  const message = error instanceof Error ? error.message.replace('Firebase: ', '') : 'Unable to sync your Firestore profile.';

  if (message.toLowerCase().includes('client is offline')) {
    return 'Firestore is not reachable from this browser right now. Check that Cloud Firestore is created/enabled for this Firebase project and that your internet/ad blocker is not blocking firestore.googleapis.com.';
  }

  if (message.toLowerCase().includes('permission-denied') || message.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Firestore rejected this request. Publish the provided Firestore security rules for users/{uid} access.';
  }

  return message;
}

function isEmailAlreadyInUse(error: unknown): boolean {
  const errorWithCode = error as { code?: string; message?: string };
  const value = `${errorWithCode.code ?? ''} ${errorWithCode.message ?? ''}`.toLowerCase();
  return value.includes('email-already-in-use');
}
