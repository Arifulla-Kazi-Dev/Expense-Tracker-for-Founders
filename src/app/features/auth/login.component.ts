import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService, isMissingWorkspaceProfileError } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

const RETURNING_USER_STORAGE_KEY = 'startup-expense-os-auth-seen';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  errorMessage = '';
  inviteToken = '';
  isSubmitting = false;
  showSignupPrompt = false;
  private isRedirectingAuthenticatedUser = false;

  ngOnInit(): void {
    this.inviteToken = this.readInviteToken();

    this.authService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (user && !this.isInviteFlow) {
          void this.redirectAuthenticatedUser();
        }
      });
  }

  get isInviteFlow(): boolean {
    return Boolean(this.inviteToken);
  }

  get isDarkMode(): boolean {
    return this.themeService.isDark();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  async loginWithGoogle(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.showSignupPrompt = false;

    try {
      await this.authService.loginWithGoogle(this.currentInviteToken());
      this.rememberReturningUser();
      this.clearStoredInvite();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
      if (this.authService.currentUser) {
        await this.redirectAuthenticatedUser();
        return;
      }

      if (isMissingWorkspaceProfileError(error)) {
        await this.redirectToRegister();
        return;
      }

      this.showSignupPrompt = shouldOfferSignup(error);
      this.errorMessage = authErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  signupQueryParams(): Record<string, string> | null {
    return this.isInviteFlow ? { inviteToken: this.inviteToken } : null;
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

  private clearStoredInvite(): void {
    if (this.isBrowser) {
      sessionStorage.removeItem('inviteToken');
    }
  }

  private async redirectToRegister(): Promise<void> {
    const queryParams: Record<string, string> = {
      reason: 'setup',
    };

    if (this.inviteToken) {
      queryParams['inviteToken'] = this.inviteToken;
    }

    await this.router.navigate(['/register'], { queryParams, replaceUrl: true });
  }

  private async redirectAuthenticatedUser(): Promise<void> {
    if (this.isRedirectingAuthenticatedUser) {
      return;
    }

    this.isRedirectingAuthenticatedUser = true;
    this.errorMessage = '';
    this.showSignupPrompt = false;
    this.rememberReturningUser();
    this.clearStoredInvite();

    await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
  }

  private currentInviteToken(): string | null {
    return this.inviteToken.trim() || null;
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

    if (normalized.includes('no company workspace profile exists')) {
      return 'This Google account is not part of a workspace yet. Create one or use an invite link.';
    }

    return cleanBackendTerms(error.message);
  }

  return 'Unable to sign in with Google. Please try again.';
}

function shouldOfferSignup(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | undefined;
  const normalized = `${value?.code ?? ''} ${value?.message ?? ''}`.toLowerCase();

  return normalized.includes('user-not-found')
    || normalized.includes('no company workspace profile exists');
}

function cleanBackendTerms(message: string): string {
  return message
    .replace(/Firebase:\s*/gi, '')
    .replace(/FirebaseError:\s*/gi, '')
    .replace(/Cloud Firestore/gi, 'Cloud database')
    .replace(/Firestore/gi, 'Cloud');
}
