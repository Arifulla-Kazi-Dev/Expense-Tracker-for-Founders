import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService } from '../../core/services/auth.service';

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

  ngOnInit(): void {
    this.inviteToken = this.readInviteToken();
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

    try {
      await this.authService.login(this.form.controls.email.value, this.form.controls.password.value, this.currentInviteToken());
      this.clearStoredInvite();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
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

    try {
      await this.authService.loginWithGoogle(this.currentInviteToken());
      this.clearStoredInvite();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
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

  private clearStoredInvite(): void {
    if (this.isBrowser) {
      sessionStorage.removeItem('inviteToken');
    }
  }

  private currentInviteToken(): string | null {
    return this.inviteToken.trim() || null;
  }
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace('Firebase: ', '');
  }

  return 'Unable to sign in. Please check your credentials and try again.';
}
