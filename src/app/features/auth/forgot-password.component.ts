import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  errorMessage = '';
  successMessage = '';
  isSubmitting = false;

  async sendReset(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      await this.authService.forgotPassword(this.form.controls.email.value);
      this.successMessage = 'Password reset email sent. Check your inbox.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message.replace('Firebase: ', '') : 'Unable to send reset email.';
    } finally {
      this.isSubmitting = false;
    }
  }
}
