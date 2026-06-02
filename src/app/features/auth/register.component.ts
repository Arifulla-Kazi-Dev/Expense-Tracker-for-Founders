import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    companyName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  errorMessage = '';
  isSubmitting = false;

  async register(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    try {
      await this.authService.register(this.form.getRawValue());
      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
    } catch (error) {
      this.errorMessage = authErrorMessage(error);
    } finally {
      this.isSubmitting = false;
    }
  }

  async registerWithGoogle(): Promise<void> {
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

  return 'Unable to create the account. Please try again.';
}
