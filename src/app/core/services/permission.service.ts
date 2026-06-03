import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';

import { Permission, ROLE_PERMISSIONS, UserRole, hasPermission, roleDisplayName } from '../models/role.model';
import { UserProfile } from '../models/user-profile.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly authService = inject(AuthService);
  private currentProfile: UserProfile | null = null;

  readonly role$: Observable<UserRole | null> = this.authService.profile$.pipe(
    map((profile) => profile?.role ?? null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly activeCompanyId$ = this.authService.profile$.pipe(
    map((profile) => profile?.activeCompanyId ?? profile?.defaultCompanyId ?? null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly permissions$ = this.role$.pipe(
    map((role) => role ? ROLE_PERMISSIONS[role] : null),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    this.authService.profile$.subscribe((profile) => {
      this.currentProfile = profile;
    });
  }

  get activeCompanyId(): string | null {
    return this.currentProfile?.activeCompanyId ?? this.currentProfile?.defaultCompanyId ?? null;
  }

  get currentRole(): UserRole | null {
    return this.currentProfile?.role ?? null;
  }

  can(permission: Permission): boolean {
    return hasPermission(this.currentRole, permission);
  }

  can$(permission: Permission): Observable<boolean> {
    return this.role$.pipe(map((role) => hasPermission(role, permission)));
  }

  roleLabel(): string {
    return roleDisplayName(this.currentRole);
  }
}
