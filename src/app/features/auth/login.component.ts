import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService, isMissingWorkspaceProfileError } from '../../core/services/auth.service';

const RETURNING_USER_STORAGE_KEY = 'startup-expense-os-auth-seen';
const SIGNIN_INTENT = 'signin';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  errorMessage = '';
  inviteToken = '';
  isSubmitting = false;
  showSignupPrompt = false;

  ngOnInit(): void {
    this.inviteToken = this.readInviteToken();
    this.prefillEmailFromQuery();

    if (this.shouldSendFirstVisitToRegister()) {
      void this.router.navigate(['/register'], { replaceUrl: true });
    }
  }

  get isInviteFlow(): boolean {
    return Boolean(this.inviteToken);
  }

  async login(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.showSignupPrompt = false;

    try {
      await this.authService.login(this.form.controls.email.value, this.form.controls.password.value, this.currentInviteToken());
      this.rememberReturningUser();
      this.clearStoredInvite();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
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
    const email = this.form.controls.email.value.trim();
    const queryParams: Record<string, string> = {};

    if (this.isInviteFlow) {
      queryParams['inviteToken'] = this.inviteToken;
    }

    if (email) {
      queryParams['email'] = email;
    }

    return Object.keys(queryParams).length ? queryParams : null;
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

  private prefillEmailFromQuery(): void {
    const email = this.route.snapshot.queryParamMap.get('email')?.trim();

    if (email) {
      this.form.controls.email.setValue(email);
    }
  }

  private async redirectToRegister(): Promise<void> {
    const queryParams: Record<string, string> = {
      reason: 'setup',
    };
    const email = this.form.controls.email.value.trim();

    if (email) {
      queryParams['email'] = email;
    }

    if (this.inviteToken) {
      queryParams['inviteToken'] = this.inviteToken;
    }

    await this.router.navigate(['/register'], { queryParams, replaceUrl: true });
  }

  private currentInviteToken(): string | null {
    return this.inviteToken.trim() || null;
  }

  private shouldSendFirstVisitToRegister(): boolean {
    if (!this.isBrowser || this.inviteToken || this.route.snapshot.queryParamMap.get('intent') === SIGNIN_INTENT) {
      return false;
    }

    try {
      return localStorage.getItem(RETURNING_USER_STORAGE_KEY) !== 'true';
    } catch {
      return false;
    }
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

    if (normalized.includes('invalid-credential') || normalized.includes('wrong-password')) {
      return 'Those sign-in details did not match a workspace account. Try again, reset your password, or create a workspace account.';
    }

    if (normalized.includes('user-not-found')) {
      return 'No workspace account exists for this email yet. Create an account to continue.';
    }

    if (normalized.includes('popup-closed') || normalized.includes('popup closed')) {
      return 'Google Sign-In was closed before it finished.';
    }

    return cleanBackendTerms(error.message);
  }

  return 'Unable to sign in. Please check your credentials and try again.';
}

function shouldOfferSignup(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | undefined;
  const normalized = `${value?.code ?? ''} ${value?.message ?? ''}`.toLowerCase();

  return normalized.includes('invalid-credential')
    || normalized.includes('user-not-found')
    || normalized.includes('no company workspace profile exists');
}

function cleanBackendTerms(message: string): string {
  return message
    .replace(/Firebase:\s*/gi, '')
    .replace(/FirebaseError:\s*/gi, '')
    .replace(/Cloud Firestore/gi, 'Cloud database')
    .replace(/Firestore/gi, 'Cloud');
}
