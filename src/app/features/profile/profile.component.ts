import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { UserService } from '../../core/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private hasLoadedProfile = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly profile = toSignal(this.userService.profile$, { initialValue: null });
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    companyName: ['', [Validators.required, Validators.minLength(2)]],
  });

  errorMessage = '';
  isSaving = false;
  toastMessage = '';

  constructor() {
    effect(() => {
      this.patchFromProfile(this.profile());
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      await this.userService.updateProfile(this.form.getRawValue());
      this.showToast('Profile saved to Cloud');
      this.form.markAsPristine();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to update profile.';
    } finally {
      this.isSaving = false;
    }
  }

  patchFromProfile(profile: { name?: string; companyName?: string } | null): void {
    if (!profile || this.hasLoadedProfile || this.form.dirty) {
      return;
    }

    this.hasLoadedProfile = true;
    this.form.patchValue({
      name: profile.name ?? '',
      companyName: profile.companyName ?? '',
    });
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2200);
  }
}
