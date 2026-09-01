import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';
import { Firestore, collection, collectionSnapshots, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, catchError, combineLatest, distinctUntilChanged, map, of, shareReplay, switchMap, tap } from 'rxjs';

import { CompanyMember, CompanyMembership } from '../models/company.model';
import { Permission, UserRole, effectivePermissions, hasPermission, normalizeUserRole, roleDisplayName } from '../models/role.model';
import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';

const ACTIVE_COMPANY_STORAGE_PREFIX = 'startup-expense-os-active-company';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly authService = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private currentProfile: UserProfile | null = null;
  private currentMember: CompanyMember | null = null;
  private currentMemberships: CompanyMembership[] = [];
  private currentPermissions: Record<Permission, boolean> | null = null;
  private currentActiveCompanyId: string | null = null;
  private readonly selectedCompanyIdSubject = new BehaviorSubject<string | null>(null);

  readonly memberships$: Observable<CompanyMembership[]> = this.authService.uid$.pipe(
    switchMap((uid) => {
      if (!uid) {
        return of([] as CompanyMembership[]);
      }

      return this.runInFirebaseContext(() =>
        collectionSnapshots(collection(this.firestore, `users/${uid}/memberships`)).pipe(
          map((snapshots) =>
            snapshots
              .map((snapshot) => normalizeMembership(uid, snapshot.id, snapshot.data()))
              .filter((membership) => membership.status === 'active'),
          ),
          catchError((error) => {
            console.error('Memberships load failed', error);
            return of([] as CompanyMembership[]);
          }),
        ),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly activeCompanyId$ = combineLatest([
    this.authService.uid$,
    this.authService.profile$,
    this.memberships$,
    this.selectedCompanyIdSubject.asObservable(),
  ]).pipe(
    map(([uid, profile, memberships, selectedCompanyId]) =>
      this.resolveActiveCompanyId(uid, profile, memberships, selectedCompanyId),
    ),
    distinctUntilChanged(),
    tap((companyId) => {
      this.currentActiveCompanyId = companyId;

      const uid = this.authService.currentUser?.uid;

      if (uid && companyId) {
        this.storeActiveCompanyId(uid, companyId);
      }
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly activeMembership$: Observable<CompanyMembership | null> = combineLatest([
    this.memberships$,
    this.activeCompanyId$,
  ]).pipe(
    map(([memberships, companyId]) => memberships.find((membership) => membership.companyId === companyId) ?? null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly currentMember$: Observable<CompanyMember | null> = combineLatest([
    this.authService.uid$,
    this.activeCompanyId$,
  ]).pipe(
    switchMap(([uid, companyId]) => {
      if (!uid || !companyId) {
        return of(null);
      }

      return this.runInFirebaseContext(() =>
        (docData(doc(this.firestore, `companies/${companyId}/members/${uid}`)) as Observable<CompanyMember | undefined>).pipe(
          map((member) => member ? ({ ...member, uid }) : null),
          catchError(() => of(null)),
        ),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly role$: Observable<UserRole | null> = combineLatest([
    this.authService.profile$,
    this.currentMember$,
  ]).pipe(
    map(([profile, member]) => member?.role ?? profile?.role ?? null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly permissions$ = combineLatest([
    this.role$,
    this.currentMember$,
  ]).pipe(
    map(([role, member]) => effectivePermissions(role, member?.permissionOverrides)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    this.authService.profile$.subscribe((profile) => {
      this.currentProfile = profile;
    });
    this.memberships$.subscribe((memberships) => {
      this.currentMemberships = memberships;
    });
    this.currentMember$.subscribe((member) => {
      this.currentMember = member;
    });
    this.permissions$.subscribe((permissions) => {
      this.currentPermissions = permissions;
    });
  }

  get activeCompanyId(): string | null {
    return this.currentActiveCompanyId ?? this.currentProfile?.activeCompanyId ?? this.currentProfile?.defaultCompanyId ?? null;
  }

  get currentRole(): UserRole | null {
    return this.currentMember?.role ?? this.currentProfile?.role ?? null;
  }

  can(permission: Permission): boolean {
    return this.currentPermissions?.[permission] ?? hasPermission(this.currentRole, permission);
  }

  can$(permission: Permission): Observable<boolean> {
    return this.permissions$.pipe(map((permissions) => Boolean(permissions?.[permission])));
  }

  roleLabel(): string {
    return roleDisplayName(this.currentRole);
  }

  roleLabelFor(role: UserRole | null | undefined): string {
    return roleDisplayName(role);
  }

  async setActiveCompany(companyId: string): Promise<void> {
    const uid = this.authService.currentUser?.uid;

    if (!uid) {
      throw new Error('You must be signed in to switch companies.');
    }

    const membership = this.currentMemberships.find((item) => item.companyId === companyId && item.status === 'active');

    if (!membership) {
      throw new Error('You do not have active access to that company.');
    }

    this.currentActiveCompanyId = companyId;
    this.selectedCompanyIdSubject.next(companyId);
    this.storeActiveCompanyId(uid, companyId);

    await this.runInFirebaseContext(() =>
      setDoc(doc(this.firestore, `users/${uid}`), {
        uid,
        activeCompanyId: companyId,
        companyName: membership.companyName,
        role: membership.role,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    );
  }

  private runInFirebaseContext<T>(operation: () => T): T {
    return runInInjectionContext(this.environmentInjector, operation);
  }

  private resolveActiveCompanyId(
    uid: string | null,
    profile: UserProfile | null,
    memberships: CompanyMembership[],
    selectedCompanyId: string | null,
  ): string | null {
    const activeCompanyIds = new Set(memberships.map((membership) => membership.companyId));
    const storedCompanyId = this.readStoredActiveCompanyId(uid);
    const candidates = [
      selectedCompanyId,
      storedCompanyId,
      profile?.activeCompanyId,
      profile?.defaultCompanyId,
    ].filter(Boolean) as string[];

    const allowedCandidate = candidates.find((companyId) => activeCompanyIds.has(companyId));

    if (allowedCandidate) {
      return allowedCandidate;
    }

    return memberships[0]?.companyId ?? profile?.activeCompanyId ?? profile?.defaultCompanyId ?? null;
  }

  private readStoredActiveCompanyId(uid: string | null): string | null {
    if (!uid) {
      return null;
    }

    try {
      return globalThis.sessionStorage?.getItem(this.storageKey(uid))
        ?? globalThis.localStorage?.getItem(this.storageKey(uid))
        ?? null;
    } catch {
      return null;
    }
  }

  private storeActiveCompanyId(uid: string, companyId: string): void {
    try {
      globalThis.sessionStorage?.setItem(this.storageKey(uid), companyId);
      globalThis.localStorage?.setItem(this.storageKey(uid), companyId);
    } catch {
      // Browser storage can be unavailable in locked-down environments.
    }
  }

  private storageKey(uid: string): string {
    return `${ACTIVE_COMPANY_STORAGE_PREFIX}:${uid}`;
  }
}

function normalizeMembership(uid: string, companyId: string, value: Record<string, unknown>): CompanyMembership {
  return {
    id: companyId,
    uid,
    userId: (value['userId'] as string | undefined) ?? (value['uid'] as string | undefined) ?? uid,
    companyId: (value['companyId'] as string | undefined) ?? companyId,
    companyName: (value['companyName'] as string | undefined) ?? 'Company workspace',
    name: (value['name'] as string | undefined) ?? 'Member',
    email: (value['email'] as string | null | undefined) ?? null,
    photoURL: (value['photoURL'] as string | null | undefined) ?? null,
    role: normalizeUserRole(value['role']),
    status: (value['status'] as CompanyMembership['status'] | undefined) ?? 'active',
    invitedBy: (value['invitedBy'] as string | undefined) ?? '',
    joinedAt: value['joinedAt'] as CompanyMembership['joinedAt'],
    createdAt: value['createdAt'] as CompanyMembership['createdAt'],
    updatedAt: value['updatedAt'] as CompanyMembership['updatedAt'],
    inviteId: value['inviteId'] as string | undefined,
    permissionOverrides: value['permissionOverrides'] as CompanyMembership['permissionOverrides'],
  };
}
