import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';

import { CompanyMember } from '../models/company.model';
import { Permission, UserRole, effectivePermissions, hasPermission, roleDisplayName } from '../models/role.model';
import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly authService = inject(AuthService);
  private readonly firestore = inject(Firestore);
  private currentProfile: UserProfile | null = null;
  private currentMember: CompanyMember | null = null;
  private currentPermissions: Record<Permission, boolean> | null = null;

  readonly activeCompanyId$ = this.authService.profile$.pipe(
    map((profile) => profile?.activeCompanyId ?? profile?.defaultCompanyId ?? null),
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

      return (docData(doc(this.firestore, `companies/${companyId}/members/${uid}`)) as Observable<CompanyMember | undefined>).pipe(
        map((member) => member ? ({ ...member, uid }) : null),
        catchError(() => of(null)),
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
    this.currentMember$.subscribe((member) => {
      this.currentMember = member;
    });
    this.permissions$.subscribe((permissions) => {
      this.currentPermissions = permissions;
    });
  }

  get activeCompanyId(): string | null {
    return this.currentProfile?.activeCompanyId ?? this.currentProfile?.defaultCompanyId ?? null;
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
}
