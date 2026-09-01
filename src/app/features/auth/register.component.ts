import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyInvite } from '../../core/models/company.model';
import { roleDisplayName } from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';
import { InviteService } from '../../core/services/invite.service';
import { ThemeService } from '../../core/services/theme.service';

const RETURNING_USER_STORAGE_KEY = 'startup-expense-os-auth-seen';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly inviteService = inject(InviteService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly form = this.formBuilder.nonNullable.group({
    name: [''],
    companyName: ['', [Validators.required, Validators.minLength(2)]],
  });

  errorMessage = '';
  inviteError = '';
  invite: CompanyInvite | null = null;
  inviteToken = '';
  isInviteLoading = false;
  isSubmitting = false;
  setupReason = '';
  private isRedirectingAuthenticatedUser = false;

  ngOnInit(): void {
    this.inviteToken = this.readInviteToken();
    this.prefillFromQuery();

    this.authService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user && !this.isInviteFlow && this.setupReason !== 'setup') {
          void this.redirectAuthenticatedUser();
        }
      });

    if (this.inviteToken) {
      this.form.controls.companyName.disable();
      void this.validateInvite(this.inviteToken);
    }
  }

  get isInviteFlow(): boolean {
    return Boolean(this.inviteToken);
  }

  get isDarkMode(): boolean {
    return this.themeService.isDark();
  }

  get roleLabel(): string {
    return this.invite ? roleDisplayName(this.invite.role) : 'Founder / Super Admin';
  }

  get companyLabel(): string {
    return this.invite?.companyName ?? 'Your company';
  }

  get canSubmit(): boolean {
    if (this.isSubmitting || this.isInviteLoading) {
      return false;
    }

    return this.isInviteFlow ? Boolean(this.invite) : this.form.valid;
  }

  get loginQueryParams(): Record<string, string> {
    return this.isInviteFlow
      ? { inviteToken: this.inviteToken, intent: 'signin' }
      : { intent: 'signin' };
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  invitePanelClass(): string {
    return this.inviteError
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100'
      : 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100';
  }

  async registerWithGoogle(): Promise<void> {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      const formValue = this.form.getRawValue();

      await this.authService.loginWithGoogle(this.currentInviteToken(), {
        companyName: formValue.companyName,
        name: formValue.name,
      }, {
        allowWorkspaceCreation: true,
      });
      this.rememberReturningUser();
      this.clearStoredInvite();
      // New owners land on the onboarding follow-up; invited members go straight in.
      const target = this.isInviteFlow ? '/dashboard' : '/follow-up';
      await this.router.navigateByUrl(target, { replaceUrl: true });
    } catch (error) {
      this.errorMessage = authErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  private readInviteToken(): string {
    const token = this.route.snapshot.queryParamMap.get('inviteToken')
      ?? (this.isBrowser ? sessionStorage.getItem('inviteToken') : '')
      ?? '';

    if (token && this.isBrowser) {
      sessionStorage.setItem('inviteToken', token);
    }

    return token;
  }

  private async validateInvite(token: string): Promise<void> {
    this.isInviteLoading = true;
    this.inviteError = '';

    try {
      const invite = await this.inviteService.validateInviteToken(token);

      if (!invite) {
        this.inviteError = 'This invite link was not found. Ask the founder to generate a fresh invite.';
        return;
      }

      if (invite.status !== 'pending') {
        this.inviteError = `This invite is already ${invite.status}. Ask the founder to generate a fresh invite.`;
        return;
      }

      this.invite = invite;
      this.form.controls.companyName.setValue(invite.companyName);
      this.form.controls.companyName.disable();
    } catch (error) {
      this.inviteError = authErrorMessage(error);
    } finally {
      this.isInviteLoading = false;
    }
  }

  private clearStoredInvite(): void {
    if (this.isBrowser) {
      sessionStorage.removeItem('inviteToken');
    }
  }

  private prefillFromQuery(): void {
    this.setupReason = this.route.snapshot.queryParamMap.get('reason')?.trim() ?? '';
  }

  private currentInviteToken(): string | null {
    return this.invite?.token ?? (this.inviteToken.trim() || null);
  }

  private rememberReturningUser(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(RETURNING_USER_STORAGE_KEY, 'true');
    } catch {
      // Storage can be disabled in private or locked-down browsers.
    }
  }

  private async redirectAuthenticatedUser(): Promise<void> {
    if (this.isRedirectingAuthenticatedUser) {
      return;
    }

    this.isRedirectingAuthenticatedUser = true;
    this.errorMessage = '';
    this.rememberReturningUser();
    this.clearStoredInvite();

    await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const normalized = `${(error as { code?: string }).code ?? ''} ${error.message}`.toLowerCase();

    if (normalized.includes('popup-closed') || normalized.includes('popup closed') || normalized.includes('cancelled-popup')) {
      return 'Google Sign-In was closed before it finished. Try again to continue.';
    }

    if (normalized.includes('popup-blocked')) {
      return 'Your browser blocked the Google Sign-In popup. Allow popups for this site and try again.';
    }

    return cleanBackendTerms(error.message);
  }

  return 'Unable to create the account. Please try again.';
}

function cleanBackendTerms(message: string): string {
  return message
    .replace(/Firebase:\s*/gi, '')
    .replace(/FirebaseError:\s*/gi, '')
    .replace(/Cloud Firestore/gi, 'Cloud database')
    .replace(/Firestore/gi, 'Cloud');
}
