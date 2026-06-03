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
import {
  Firestore,
  collection,
  doc,
  docData,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, catchError, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';

import { CompanyInvite } from '../models/company.model';
import { INVITABLE_ROLES, UserRole } from '../models/role.model';
import { UserProfile } from '../models/user-profile.model';

export interface RegisterCredentials {
  name: string;
  companyName: string;
  email: string;
  password: string;
  inviteToken?: string | null;
}

interface ProfileSyncOverrides extends Partial<Pick<UserProfile, 'companyName' | 'name'>> {
  includeCreatedAt?: boolean;
  inviteToken?: string | null;
}

const AUTH_TIMEOUT_MS = 15000;
const PROFILE_SYNC_TIMEOUT_MS = 15000;
const LEGACY_LEDGER_COLLECTIONS = [
  'funding',
  'expenses',
  'teamPayments',
  'startupCosts',
  'recurringCosts',
  'founderNotes',
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  private readonly profileSyncErrorSubject = new BehaviorSubject<string>('');
  private isHandlingExplicitAuthFlow = false;

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

      if (this.isHandlingExplicitAuthFlow) {
        return;
      }

      void this.tryEnsureUserProfile(user);
    });
  }

  async register(credentials: RegisterCredentials): Promise<void> {
    let result: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;
    this.isHandlingExplicitAuthFlow = true;

    try {
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
        inviteToken: credentials.inviteToken,
        name: credentials.name,
      });
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
  }

  async login(email: string, password: string, inviteToken?: string | null): Promise<void> {
    this.isHandlingExplicitAuthFlow = true;

    try {
      const result = await withTimeout(
        this.runInFirebaseContext(() => signInWithEmailAndPassword(this.auth, email, password)),
        AUTH_TIMEOUT_MS,
        'Firebase Auth login is taking too long. Check your connection and Firebase Auth settings.',
      );

      await this.ensureUserProfileWithRetry(result.user, { includeCreatedAt: true, inviteToken });
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
  }

  async loginWithGoogle(inviteToken?: string | null): Promise<void> {
    this.isHandlingExplicitAuthFlow = true;
    const provider = new GoogleAuthProvider();

    try {
      const result = await withTimeout(
        this.runInFirebaseContext(() => signInWithPopup(this.auth, provider)),
        AUTH_TIMEOUT_MS,
        'Google Sign-In is taking too long. Check popup permissions and Firebase Auth settings.',
      );

      await this.ensureUserProfileWithRetry(result.user, { includeCreatedAt: true, inviteToken });
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
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
    overrides: ProfileSyncOverrides = {},
  ): Promise<void> {
    const attempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await withTimeout(
          this.ensureUserProfile(user, overrides),
          PROFILE_SYNC_TIMEOUT_MS,
          'Firestore profile sync timed out. Check that Cloud Firestore is enabled and rules allow users/{uid}, companies/{companyId}, and member writes.',
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
    overrides: ProfileSyncOverrides = {},
  ): Promise<void> {
    const profileRef = doc(this.firestore, `users/${user.uid}`);
    const existingProfile = await this.runInFirebaseContext(() => getDoc(profileRef));
    const existingData = existingProfile.data() as Partial<UserProfile> | undefined;
    const now = serverTimestamp();
    const name = overrides.name ?? user.displayName ?? user.email?.split('@')[0] ?? 'Founder';

    if (overrides.inviteToken) {
      await this.acceptInviteForUser(user, overrides.inviteToken, name, existingData, Boolean(overrides.includeCreatedAt));
      return;
    }

    const existingCompanyId = existingData?.activeCompanyId ?? existingData?.defaultCompanyId;
    const companyRef = existingCompanyId
      ? doc(this.firestore, `companies/${existingCompanyId}`)
      : doc(collection(this.firestore, 'companies'));
    const existingCompany = existingCompanyId
      ? await this.runInFirebaseContext(() => getDoc(companyRef))
      : null;
    const shouldCreateCompany = !existingCompanyId || !existingCompany?.exists();
    const companyId = existingCompanyId ?? companyRef.id;
    const companyName = overrides.companyName ?? existingData?.companyName ?? `${name}'s Company`;
    const role = normalizeRole(existingData?.role, 'founder');
    const profile: Record<string, unknown> = {
      uid: user.uid,
      email: user.email,
      photoURL: user.photoURL,
      role,
      companyName,
      defaultCompanyId: existingData?.defaultCompanyId ?? companyId,
      activeCompanyId: existingData?.activeCompanyId ?? companyId,
      updatedAt: now,
      lastLoginAt: now,
    };

    if (overrides.name !== undefined || !existingProfile.exists() || !existingData?.name) {
      profile['name'] = name;
    }

    if (overrides.includeCreatedAt && !existingData?.createdAt) {
      profile['createdAt'] = now;
    }

    const batch = writeBatch(this.firestore);

    batch.set(profileRef, profile, { merge: true });
    const companyPayload: Record<string, unknown> = shouldCreateCompany ? {
      companyId,
      companyName,
      createdBy: user.uid,
      ownerUid: user.uid,
      plan: 'free',
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } : {
      companyId,
      companyName,
      updatedAt: now,
      isActive: true,
    };

    batch.set(companyRef, companyPayload, { merge: true });
    batch.set(doc(this.firestore, `companies/${companyId}/members/${user.uid}`), {
      uid: user.uid,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role,
      status: 'active',
      invitedBy: user.uid,
      joinedAt: now,
      createdAt: existingData?.createdAt ?? now,
      updatedAt: now,
    }, { merge: true });

    await this.runInFirebaseContext(() => batch.commit());

    await this.migrateLegacyLedgerData(user.uid, companyId, existingData).catch((error) => {
      this.profileSyncErrorSubject.next(`Profile synced. Legacy ledger migration skipped: ${readableFirebaseError(error)}`);
    });
  }

  private async tryEnsureUserProfile(
    user: User,
    overrides: ProfileSyncOverrides = {},
  ): Promise<void> {
    try {
      await this.ensureUserProfileWithRetry(user, overrides);
    } catch {
      // Auth should not strand the user if profile sync is temporarily unavailable.
      // The shell shows profileSyncError$ and any later Firestore write will retry against the same UID.
    }
  }

  private async acceptInviteForUser(
    user: User,
    token: string,
    fallbackName: string,
    existingData: Partial<UserProfile> | undefined,
    includeCreatedAt: boolean,
  ): Promise<void> {
    const invite = await this.findInviteByToken(token);

    if (!invite) {
      throw new Error('Invite link was not found. Ask the founder to generate a fresh invite.');
    }

    if (invite.status !== 'pending') {
      throw new Error(`This invite is already ${invite.status}. Ask the founder to generate a fresh invite.`);
    }

    if (isInviteExpired(invite.expiresAt)) {
      throw new Error('This invite link has expired. Ask the founder to generate a fresh invite.');
    }

    if (!INVITABLE_ROLES.includes(invite.role)) {
      throw new Error('Founder role cannot be accepted through an invite link.');
    }

    const now = serverTimestamp();
    const name = existingData?.name ?? user.displayName ?? fallbackName;
    const profileRef = doc(this.firestore, `users/${user.uid}`);
    const memberRef = doc(this.firestore, `companies/${invite.companyId}/members/${user.uid}`);
    const inviteRef = doc(this.firestore, `companies/${invite.companyId}/invites/${invite.inviteId}`);
    const inviteLookupRef = doc(this.firestore, `inviteLookups/${invite.token}`);
    const profile: Record<string, unknown> = {
      uid: user.uid,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role: invite.role,
      companyName: invite.companyName,
      defaultCompanyId: existingData?.defaultCompanyId ?? invite.companyId,
      activeCompanyId: invite.companyId,
      updatedAt: now,
      lastLoginAt: now,
    };

    if (includeCreatedAt && !existingData?.createdAt) {
      profile['createdAt'] = now;
    }

    const batch = writeBatch(this.firestore);
    batch.set(profileRef, profile, { merge: true });
    batch.set(memberRef, {
      uid: user.uid,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role: invite.role,
      status: 'active',
      invitedBy: invite.invitedByUid,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
      inviteId: invite.inviteId,
    }, { merge: true });
    batch.update(inviteRef, {
      status: 'accepted',
      acceptedAt: now,
      acceptedByUid: user.uid,
      updatedAt: now,
    });
    batch.update(inviteLookupRef, {
      status: 'accepted',
      acceptedAt: now,
      acceptedByUid: user.uid,
      updatedAt: now,
    });

    await this.runInFirebaseContext(() => batch.commit());
  }

  private async findInviteByToken(token: string): Promise<CompanyInvite | null> {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const snapshot = await this.runInFirebaseContext(() => getDoc(doc(this.firestore, `inviteLookups/${normalizedToken}`)));
    return snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as CompanyInvite) : null;
  }

  private async migrateLegacyLedgerData(
    uid: string,
    companyId: string,
    existingData: Partial<UserProfile> | undefined,
  ): Promise<void> {
    if (existingData?.legacyDataMigratedAt) {
      return;
    }

    const now = serverTimestamp();
    let batch = writeBatch(this.firestore);
    let writesInBatch = 0;

    const commitIfNeeded = async (force = false): Promise<void> => {
      if (!force && writesInBatch < 450) {
        return;
      }

      if (writesInBatch === 0) {
        return;
      }

      await this.runInFirebaseContext(() => batch.commit());
      batch = writeBatch(this.firestore);
      writesInBatch = 0;
    };

    for (const collectionName of LEGACY_LEDGER_COLLECTIONS) {
      const legacySnapshots = await this.runInFirebaseContext(() =>
        getDocs(collection(this.firestore, `users/${uid}/${collectionName}`)),
      );

      for (const snapshot of legacySnapshots.docs) {
        const data = snapshot.data() as Record<string, unknown>;
        batch.set(doc(this.firestore, `companies/${companyId}/${collectionName}/${snapshot.id}`), {
          ...data,
          id: data['id'] ?? snapshot.id,
          uid: data['uid'] ?? uid,
          companyId,
          createdAt: data['createdAt'] ?? now,
          updatedAt: data['updatedAt'] ?? now,
          migratedAt: now,
          migratedFrom: `users/${uid}/${collectionName}/${snapshot.id}`,
        }, { merge: true });
        writesInBatch += 1;

        await commitIfNeeded();
      }
    }

    batch.set(doc(this.firestore, `users/${uid}`), {
      uid,
      legacyDataMigratedAt: now,
      updatedAt: now,
    }, { merge: true });
    writesInBatch += 1;

    await commitIfNeeded(true);
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
    return 'Firestore rejected this request. Publish the updated Firestore rules for users, companies, members, invites, and company ledger collections.';
  }

  return message;
}

function isEmailAlreadyInUse(error: unknown): boolean {
  const errorWithCode = error as { code?: string; message?: string };
  const value = `${errorWithCode.code ?? ''} ${errorWithCode.message ?? ''}`.toLowerCase();
  return value.includes('email-already-in-use');
}

function normalizeRole(value: unknown, fallback: UserRole): UserRole {
  const role = value as UserRole;
  const validRoles: UserRole[] = [
    'founder',
    'cofounder',
    'finance-manager',
    'operations-manager',
    'hr-manager',
    'team-member',
    'auditor',
    'investor',
  ];

  return validRoles.includes(role) ? role : fallback;
}

function isInviteExpired(value: unknown): boolean {
  const timestamp = value as { toDate?: () => Date };
  const date = timestamp?.toDate
    ? timestamp.toDate()
    : value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;

  return date ? date.getTime() <= Date.now() : false;
}
