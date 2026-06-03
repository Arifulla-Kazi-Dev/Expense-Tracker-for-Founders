import { CommonModule } from '@angular/common';
import { Component, OnDestroy, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { CompanyService } from '../../core/services/company.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ReactiveFormsModule, RouterLink],
  templateUrl: './company-settings.component.html',
})
export class CompanySettingsComponent implements OnDestroy {
  private readonly companyService = inject(CompanyService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly permissionService = inject(PermissionService);
  private hasPatched = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly company = toSignal(this.companyService.activeCompany$, { initialValue: null });
  readonly form = this.formBuilder.nonNullable.group({
    companyName: ['', [Validators.required, Validators.minLength(2)]],
  });

  errorMessage = '';
  isSaving = false;
  toastMessage = '';

  constructor() {
    effect(() => {
      const company = this.company();

      if (!company || this.hasPatched || this.form.dirty) {
        return;
      }

      this.hasPatched = true;
      this.form.patchValue({ companyName: company.companyName });
    });
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  canManageCompany(): boolean {
    return this.permissionService.can('manageCompany');
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving || !this.canManageCompany()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      await this.companyService.updateCompanyProfile(this.form.controls.companyName.value);
      this.form.markAsPristine();
      this.showToast('Company settings saved');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save company settings.';
    } finally {
      this.isSaving = false;
    }
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
