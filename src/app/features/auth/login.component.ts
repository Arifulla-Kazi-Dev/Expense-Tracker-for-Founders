import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  errorMessage = '';
  isSubmitting = false;

  async login(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.login(this.form.controls.email.value, this.form.controls.password.value);
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
      await this.authService.loginWithGoogle();
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
      this.errorMessage = authErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace('Firebase: ', '');
  }

  return 'Unable to sign in. Please check your credentials and try again.';
}
