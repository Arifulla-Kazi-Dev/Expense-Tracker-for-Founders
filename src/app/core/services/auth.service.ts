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
  limit,
  query,
  serverTimestamp,
  where,
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
  allowWorkspaceCreation?: boolean;
  includeCreatedAt?: boolean;
  inviteToken?: string | null;
}

export class MissingWorkspaceProfileError extends Error {
  readonly code = 'missing-workspace-profile';

  constructor(email?: string | null) {
    super(
      email
        ? `No company workspace profile exists for ${email}. Create or join a workspace to continue.`
        : 'No company workspace profile exists for this account. Create or join a workspace to continue.',
    );
    this.name = 'MissingWorkspaceProfileError';
  }
}

export function isMissingWorkspaceProfileError(error: unknown): boolean {
  const value = error as { code?: string; message?: string; name?: string } | undefined;

  return value?.code === 'missing-workspace-profile'
    || value?.name === 'MissingWorkspaceProfileError'
    || Boolean(value?.message?.toLowerCase().includes('no company workspace profile exists'));
}

const AUTH_TIMEOUT_MS = 15000;
const GOOGLE_AUTH_TIMEOUT_MS = 45000;
const PROFILE_SYNC_TIMEOUT_MS = 15000;
const INVITE_TOKEN_STORAGE_KEY = 'inviteToken';
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
  private pendingInviteToken = '';

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
    const inviteToken = this.resolveInviteToken(credentials.inviteToken);
    this.isHandlingExplicitAuthFlow = true;

    try {
      try {
        result = await withTimeout(
          this.runInFirebaseContext(() => createUserWithEmailAndPassword(this.auth, credentials.email, credentials.password)),
          AUTH_TIMEOUT_MS,
          'Cloud sign-up is taking too long. Check your connection and authorized domains.',
        );
      } catch (error) {
        if (!isEmailAlreadyInUse(error)) {
          throw error;
        }

        result = await withTimeout(
          this.runInFirebaseContext(() => signInWithEmailAndPassword(this.auth, credentials.email, credentials.password)),
          AUTH_TIMEOUT_MS,
          'This account already exists. I tried signing in to repair the profile, but Cloud sign-in did not respond.',
        );
      }

      await withTimeout(
        this.runInFirebaseContext(() => updateProfile(result.user, { displayName: credentials.name })),
        PROFILE_SYNC_TIMEOUT_MS,
        'Cloud profile display name update timed out.',
      ).catch((error) => this.profileSyncErrorSubject.next(readableFirebaseError(error)));

      await this.ensureProfileAfterAuth(result.user, {
        allowWorkspaceCreation: true,
        companyName: credentials.companyName,
        includeCreatedAt: true,
        inviteToken,
        name: credentials.name,
      });
      this.clearPendingInviteToken(inviteToken);
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
  }

  async login(email: string, password: string, inviteToken?: string | null): Promise<void> {
    const resolvedInviteToken = this.resolveInviteToken(inviteToken);
    this.isHandlingExplicitAuthFlow = true;

    try {
      const result = await withTimeout(
        this.runInFirebaseContext(() => signInWithEmailAndPassword(this.auth, email, password)),
        AUTH_TIMEOUT_MS,
        'Cloud sign-in is taking too long. Check your connection and sign-in settings.',
      );

      await this.ensureProfileAfterAuth(result.user, {
        allowWorkspaceCreation: false,
        includeCreatedAt: true,
        inviteToken: resolvedInviteToken,
      });
      this.clearPendingInviteToken(resolvedInviteToken);
    } catch (error) {
      await this.signOutIfMissingWorkspaceProfile(error);
      throw error;
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
  }

  async loginWithGoogle(
    inviteToken?: string | null,
    profileOverrides: Partial<Pick<UserProfile, 'companyName' | 'name'>> = {},
    options: { allowWorkspaceCreation?: boolean } = {},
  ): Promise<void> {
    const resolvedInviteToken = this.resolveInviteToken(inviteToken);
    this.isHandlingExplicitAuthFlow = true;
    const provider = new GoogleAuthProvider();

    try {
      const result = await withTimeout(
        this.runInFirebaseContext(() => signInWithPopup(this.auth, provider)),
        GOOGLE_AUTH_TIMEOUT_MS,
        'Google Sign-In is taking too long. Check popup permissions and Cloud sign-in settings.',
      );

      if (profileOverrides.name?.trim()) {
        await withTimeout(
          this.runInFirebaseContext(() => updateProfile(result.user, { displayName: profileOverrides.name?.trim() })),
          PROFILE_SYNC_TIMEOUT_MS,
          'Cloud profile display name update timed out.',
        ).catch((error) => this.profileSyncErrorSubject.next(readableFirebaseError(error)));
      }

      await this.ensureProfileAfterAuth(result.user, {
        allowWorkspaceCreation: Boolean(options.allowWorkspaceCreation),
        companyName: profileOverrides.companyName,
        includeCreatedAt: true,
        inviteToken: resolvedInviteToken,
        name: profileOverrides.name?.trim() || undefined,
      });
      this.clearPendingInviteToken(resolvedInviteToken);
    } catch (error) {
      await this.signOutIfMissingWorkspaceProfile(error);
      throw error;
    } finally {
      this.isHandlingExplicitAuthFlow = false;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    await this.runInFirebaseContext(() => sendPasswordResetEmail(this.auth, email));
  }

  async logout(): Promise<void> {
    await this.runInFirebaseContext(() => signOut(this.auth));
    await this.router.navigate(['/login'], { queryParams: { intent: 'signin' }, replaceUrl: true });
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
          'Cloud profile sync timed out. Check that the cloud database is enabled and access rules allow user, company, and member writes.',
        );
        this.clearProfileSyncError();
        return;
      } catch (error) {
        lastError = error;

        if (isMissingWorkspaceProfileError(error)) {
          throw error;
        }

        if (attempt < attempts) {
          await wait(attempt * 500);
        }
      }
    }

    const message = readableFirebaseError(lastError);
    this.profileSyncErrorSubject.next(message);
    throw new Error(message);
  }

  private async ensureProfileAfterAuth(
    user: User,
    overrides: ProfileSyncOverrides = {},
  ): Promise<void> {
    try {
      await this.ensureUserProfileWithRetry(user, overrides);
    } catch (error) {
      if (overrides.inviteToken || isMissingWorkspaceProfileError(error)) {
        throw error;
      }

      this.profileSyncErrorSubject.next(readableFirebaseError(error));
    }
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

    if (this.hasPendingInviteToken()) {
      return;
    }

    const acceptedInvite = !existingData?.activeCompanyId && !existingData?.defaultCompanyId
      ? await this.findAcceptedInviteForUser(user.uid)
      : null;

    if (acceptedInvite) {
      await this.repairProfileFromAcceptedInvite(
        user,
        acceptedInvite,
        existingData,
        name,
        Boolean(overrides.includeCreatedAt),
      );
      await this.syncAcceptedInviteMemberships(user, existingData, name).catch((error) => {
        this.profileSyncErrorSubject.next(`Profile synced. Accepted invite membership backfill skipped: ${readableFirebaseError(error)}`);
      });
      return;
    }

    const existingCompanyId = existingData?.activeCompanyId ?? existingData?.defaultCompanyId;

    if (!existingCompanyId && !overrides.allowWorkspaceCreation) {
      throw new MissingWorkspaceProfileError(user.email);
    }

    const companyRef = existingCompanyId
      ? doc(this.firestore, `companies/${existingCompanyId}`)
      : doc(collection(this.firestore, 'companies'));
    const existingCompany = existingCompanyId
      ? await this.runInFirebaseContext(() => getDoc(companyRef))
      : null;
    const shouldCreateCompany = !existingCompanyId || !existingCompany?.exists();
    const companyId = existingCompanyId ?? companyRef.id;
    const companyName = existingCompanyId
      ? existingData?.companyName ?? overrides.companyName ?? `${name}'s Company`
      : overrides.companyName ?? existingData?.companyName ?? `${name}'s Company`;
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
    const memberPayload = {
      uid: user.uid,
      userId: user.uid,
      companyId,
      companyName,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role,
      status: 'active',
      invitedBy: user.uid,
      joinedAt: now,
      createdAt: existingData?.createdAt ?? now,
      updatedAt: now,
    };

    batch.set(doc(this.firestore, `companies/${companyId}/members/${user.uid}`), memberPayload, { merge: true });
    batch.set(doc(this.firestore, `users/${user.uid}/memberships/${companyId}`), memberPayload, { merge: true });

    await this.runInFirebaseContext(() => batch.commit());

    await this.migrateLegacyLedgerData(user.uid, companyId, existingData).catch((error) => {
      this.profileSyncErrorSubject.next(`Profile synced. Legacy ledger migration skipped: ${readableFirebaseError(error)}`);
    });
    await this.syncAcceptedInviteMemberships(user, existingData, name).catch((error) => {
      this.profileSyncErrorSubject.next(`Profile synced. Accepted invite membership backfill skipped: ${readableFirebaseError(error)}`);
    });
  }

  private async tryEnsureUserProfile(
    user: User,
    overrides: ProfileSyncOverrides = {},
  ): Promise<void> {
    try {
      await this.ensureUserProfileWithRetry(user, overrides);
    } catch (error) {
      if (isMissingWorkspaceProfileError(error)) {
        await this.signOutIfMissingWorkspaceProfile(error);
        await this.router.navigate(['/register'], { queryParams: { reason: 'setup' }, replaceUrl: true });
        return;
      }

      // Auth should not strand the user if profile sync is temporarily unavailable.
      // The shell shows profileSyncError$ and any later cloud write will retry against the same UID.
    }
  }

  private async signOutIfMissingWorkspaceProfile(error: unknown): Promise<void> {
    if (!isMissingWorkspaceProfileError(error)) {
      return;
    }

    await this.runInFirebaseContext(() => signOut(this.auth)).catch(() => undefined);
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

    if (invite.status === 'accepted' && invite.acceptedByUid === user.uid) {
      await this.repairProfileFromAcceptedInvite(user, invite, existingData, fallbackName, includeCreatedAt);
      return;
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
    const memberPayload = {
      uid: user.uid,
      userId: user.uid,
      companyId: invite.companyId,
      companyName: invite.companyName,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role: invite.role,
      status: 'active',
      invitedBy: invite.invitedByUid,
      permissionOverrides: {},
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
      inviteId: invite.inviteId,
    };

    batch.set(memberRef, memberPayload, { merge: true });
    batch.set(doc(this.firestore, `users/${user.uid}/memberships/${invite.companyId}`), memberPayload, { merge: true });
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

  private async repairProfileFromAcceptedInvite(
    user: User,
    invite: CompanyInvite,
    existingData: Partial<UserProfile> | undefined,
    fallbackName: string,
    includeCreatedAt: boolean,
  ): Promise<void> {
    const now = serverTimestamp();
    const name = existingData?.name ?? user.displayName ?? fallbackName;
    const profileRef = doc(this.firestore, `users/${user.uid}`);
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

    const memberPayload = {
      uid: user.uid,
      userId: user.uid,
      companyId: invite.companyId,
      companyName: invite.companyName,
      name,
      email: user.email,
      photoURL: user.photoURL,
      role: invite.role,
      status: 'active',
      invitedBy: invite.invitedByUid,
      joinedAt: now,
      createdAt: existingData?.createdAt ?? now,
      updatedAt: now,
      inviteId: invite.inviteId,
    };

    const batch = writeBatch(this.firestore);
    batch.set(profileRef, profile, { merge: true });
    batch.set(doc(this.firestore, `companies/${invite.companyId}/members/${user.uid}`), memberPayload, { merge: true });
    batch.set(doc(this.firestore, `users/${user.uid}/memberships/${invite.companyId}`), memberPayload, { merge: true });

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

  private async findAcceptedInviteForUser(uid: string): Promise<CompanyInvite | null> {
    const snapshots = await this.runInFirebaseContext(() =>
      getDocs(query(
        collection(this.firestore, 'inviteLookups'),
        where('acceptedByUid', '==', uid),
        where('status', '==', 'accepted'),
        limit(1),
      )),
    ).catch(() => null);

    const snapshot = snapshots?.docs[0];
    return snapshot ? ({ ...snapshot.data(), id: snapshot.id } as CompanyInvite) : null;
  }

  private async syncAcceptedInviteMemberships(
    user: User,
    existingData: Partial<UserProfile> | undefined,
    fallbackName: string,
  ): Promise<void> {
    if (existingData?.acceptedInviteMembershipsBackfilledAt) {
      return;
    }

    const snapshots = await this.runInFirebaseContext(() =>
      getDocs(query(
        collection(this.firestore, 'inviteLookups'),
        where('acceptedByUid', '==', user.uid),
        where('status', '==', 'accepted'),
      )),
    );
    const now = serverTimestamp();

    const markBackfilled = async (): Promise<void> => {
      const batch = writeBatch(this.firestore);

      batch.set(doc(this.firestore, `users/${user.uid}`), {
        uid: user.uid,
        acceptedInviteMembershipsBackfilledAt: now,
        updatedAt: now,
      }, { merge: true });

      await this.runInFirebaseContext(() => batch.commit());
    };

    if (snapshots.empty) {
      await markBackfilled();
      return;
    }

    const name = existingData?.name ?? user.displayName ?? fallbackName;
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

    for (const snapshot of snapshots.docs) {
      const invite = { ...snapshot.data(), id: snapshot.id } as CompanyInvite;
      const memberPayload = {
        uid: user.uid,
        userId: user.uid,
        companyId: invite.companyId,
        companyName: invite.companyName,
        name,
        email: user.email,
        photoURL: user.photoURL,
        role: invite.role,
        status: 'active',
        invitedBy: invite.invitedByUid,
        joinedAt: invite.acceptedAt ?? now,
        createdAt: existingData?.createdAt ?? invite.acceptedAt ?? now,
        updatedAt: now,
        inviteId: invite.inviteId,
      };

      batch.set(doc(this.firestore, `companies/${invite.companyId}/members/${user.uid}`), memberPayload, { merge: true });
      batch.set(doc(this.firestore, `users/${user.uid}/memberships/${invite.companyId}`), memberPayload, { merge: true });
      writesInBatch += 2;

      await commitIfNeeded();
    }

    batch.set(doc(this.firestore, `users/${user.uid}`), {
      uid: user.uid,
      acceptedInviteMembershipsBackfilledAt: now,
      updatedAt: now,
    }, { merge: true });
    writesInBatch += 1;

    await commitIfNeeded(true);
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

  private resolveInviteToken(inviteToken?: string | null): string | null {
    const normalized = normalizeInviteToken(inviteToken)
      || this.pendingInviteToken
      || this.readStoredInviteToken();

    if (!normalized) {
      return null;
    }

    this.rememberInviteToken(normalized);
    return normalized;
  }

  private hasPendingInviteToken(): boolean {
    return Boolean(this.pendingInviteToken || this.readStoredInviteToken());
  }

  private rememberInviteToken(token: string): void {
    this.pendingInviteToken = token;

    try {
      globalThis.sessionStorage?.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    } catch {
      // Storage may be unavailable during SSR or in locked-down browsers.
    }
  }

  private readStoredInviteToken(): string {
    try {
      return normalizeInviteToken(globalThis.sessionStorage?.getItem(INVITE_TOKEN_STORAGE_KEY));
    } catch {
      return '';
    }
  }

  private clearPendingInviteToken(token?: string | null): void {
    const normalized = normalizeInviteToken(token);

    if (!normalized || this.pendingInviteToken === normalized) {
      this.pendingInviteToken = '';
    }

    try {
      const storedToken = normalizeInviteToken(globalThis.sessionStorage?.getItem(INVITE_TOKEN_STORAGE_KEY));

      if (!normalized || storedToken === normalized) {
        globalThis.sessionStorage?.removeItem(INVITE_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Storage may be unavailable during SSR or in locked-down browsers.
    }
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
  const message = error instanceof Error ? cleanBackendTerms(error.message) : 'Unable to sync your Cloud profile.';

  if (message.toLowerCase().includes('client is offline')) {
    return 'Cloud data is not reachable from this browser right now. Check that the cloud database is enabled and that your internet/ad blocker is not blocking data requests.';
  }

  if (message.toLowerCase().includes('permission-denied') || message.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Cloud rejected this request. Publish the updated Cloud access rules for users, companies, members, invites, and company ledger collections.';
  }

  return message;
}

function cleanBackendTerms(message: string): string {
  return message
    .replace(/Firebase:\s*/gi, '')
    .replace(/FirebaseError:\s*/gi, '')
    .replace(/Cloud Firestore/gi, 'Cloud database')
    .replace(/Firestore/gi, 'Cloud');
}

function isEmailAlreadyInUse(error: unknown): boolean {
  const errorWithCode = error as { code?: string; message?: string };
  const value = `${errorWithCode.code ?? ''} ${errorWithCode.message ?? ''}`.toLowerCase();
  return value.includes('email-already-in-use');
}

function normalizeInviteToken(value: string | null | undefined): string {
  return value?.trim() ?? '';
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
    'mentor',
    'auditor',
    'ca',
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
