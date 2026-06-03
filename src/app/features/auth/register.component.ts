import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyInvite } from '../../core/models/company.model';
import { roleDisplayName } from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';
import { InviteService } from '../../core/services/invite.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly inviteService = inject(InviteService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    companyName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  errorMessage = '';
  inviteError = '';
  invite: CompanyInvite | null = null;
  inviteToken = '';
  isInviteLoading = false;
  isSubmitting = false;

  ngOnInit(): void {
    this.inviteToken = this.readInviteToken();

    if (this.inviteToken) {
      void this.validateInvite(this.inviteToken);
    }
  }

  get isInviteFlow(): boolean {
    return Boolean(this.inviteToken);
  }

  get roleLabel(): string {
    return this.invite ? roleDisplayName(this.invite.role) : 'Founder / Super Admin';
  }

  get companyLabel(): string {
    return this.invite?.companyName ?? 'Your company';
  }

  get canSubmit(): boolean {
    return !this.isSubmitting && !this.isInviteLoading && (!this.isInviteFlow || Boolean(this.invite));
  }

  invitePanelClass(): string {
    return this.inviteError
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100'
      : 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-100';
  }

  async register(): Promise<void> {
    if (this.form.invalid || !this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.register({
        ...this.form.getRawValue(),
        inviteToken: this.invite?.token ?? null,
      });
      this.clearStoredInvite();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
      this.errorMessage = authErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  async registerWithGoogle(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.loginWithGoogle(this.invite?.token ?? null);
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
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace('Firebase: ', '');
  }

  return 'Unable to create the account. Please try again.';
}
