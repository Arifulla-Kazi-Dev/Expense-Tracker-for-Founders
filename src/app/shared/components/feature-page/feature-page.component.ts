import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { Subscription } from 'rxjs';

import { FeatureFormField, FeaturePageConfig, FeaturePageRow, Tone } from '../../../core/models/dashboard.models';
import { badgeClass, tonePanelClass } from '../../../core/utils/ui-classnames';

export type FeatureFormValue = string | number | boolean;

export interface FeatureSaveEvent {
  id: string | null;
  value: Record<string, FeatureFormValue>;
}

@Component({
  selector: 'app-feature-page',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, ReactiveFormsModule],
  templateUrl: './feature-page.component.html',
  styleUrl: './feature-page.component.css',
})
export class FeaturePageComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) feature!: FeaturePageConfig;
  @Input() rows: FeaturePageRow[] = [];
  @Input() errorMessage = '';
  @Input() isBusy = false;

  @Output() saveRecord = new EventEmitter<FeatureSaveEvent>();
  @Output() deleteRecord = new EventEmitter<string>();
  @Output() secondaryAction = new EventEmitter<void>();

  form = new FormGroup<Record<string, FormControl<FeatureFormValue>>>({});
  editingRow: FeaturePageRow | null = null;
  isModalOpen = false;
  private fieldSignature = '';
  private formBehaviorSubscription?: Subscription;

  get fields(): FeatureFormField[] {
    return this.feature.fields ?? [];
  }

  get hasRows(): boolean {
    return this.rows.length > 0;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['feature']) {
      const nextFieldSignature = this.createFieldSignature();

      if (nextFieldSignature === this.fieldSignature) {
        return;
      }

      this.fieldSignature = nextFieldSignature;
      this.buildForm();
    }
  }

  ngOnDestroy(): void {
    this.formBehaviorSubscription?.unsubscribe();
  }

  openCreateModal(): void {
    this.editingRow = null;
    this.resetForm();
    this.isModalOpen = true;
  }

  openEditModal(row: FeaturePageRow): void {
    this.editingRow = row;
    this.resetForm(row.raw ?? {});
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  submitForm(): void {
    if (this.form.invalid || this.isBusy) {
      this.form.markAllAsTouched();
      return;
    }

    this.saveRecord.emit({
      id: this.editingRow?.id ?? null,
      value: this.formValue(),
    });
    this.closeModal();
  }

  confirmDelete(row: FeaturePageRow): void {
    if (!row.id || this.isBusy) {
      return;
    }

    const shouldDelete = window.confirm(`Delete "${row.title}"? This cannot be undone.`);

    if (shouldDelete) {
      this.deleteRecord.emit(row.id);
    }
  }

  isInvalid(field: FeatureFormField): boolean {
    const control = this.form.controls[field.name];
    return Boolean(control?.invalid && control.touched);
  }

  isRequired(field: FeatureFormField): boolean {
    return Boolean(field.required || this.matchesRequiredWhen(field));
  }

  isCategoryField(field: FeatureFormField): boolean {
    return field.type === 'select' && field.name.toLowerCase().includes('category');
  }

  isSelectedOption(field: FeatureFormField, option: string): boolean {
    return this.form.controls[field.name]?.value === option;
  }

  selectOption(field: FeatureFormField, option: string): void {
    const control = this.form.controls[field.name];

    if (!control || this.isBusy) {
      return;
    }

    control.setValue(option);
    control.markAsDirty();
    control.markAsTouched();
  }

  categoryOptionClass(field: FeatureFormField, option: string): string {
    if (this.isSelectedOption(field, option)) {
      return 'border-teal-300 bg-teal-50 text-teal-950 ring-2 ring-teal-500/20 dark:border-teal-400/30 dark:bg-teal-400/10 dark:text-teal-100';
    }

    return 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800';
  }

  categoryOptionIcon(option: string): string {
    const value = option.toLowerCase();

    if (value.includes('legal') || value.includes('company') || value.includes('startup')) {
      return 'building-2';
    }

    if (value.includes('salary') || value.includes('intern') || value.includes('team')) {
      return 'users';
    }

    if (value.includes('cloud') || value.includes('hosting') || value.includes('ai')) {
      return 'circle-gauge';
    }

    if (value.includes('marketing') || value.includes('brand') || value.includes('user')) {
      return 'trending-up';
    }

    return 'layers-3';
  }

  tonePanelClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  badgeClass(status: FeaturePageConfig['rows'][number]['status']): string {
    return badgeClass(status);
  }

  private buildForm(): void {
    const controls: Record<string, FormControl<FeatureFormValue>> = {};

    this.fields.forEach((field) => {
      controls[field.name] = new FormControl<FeatureFormValue>(this.defaultValue(field), {
        nonNullable: true,
        validators: field.required ? [Validators.required] : [],
      });
    });

    this.form = new FormGroup(controls);
    this.setupFormBehaviors();
  }

  private createFieldSignature(): string {
    return this.fields
      .map((field) =>
        [
          field.name,
          field.type,
          field.required ? 'required' : 'optional',
          field.requiredWhen ? `${field.requiredWhen.field}=${field.requiredWhen.value}` : '',
          field.readonly ? 'readonly' : '',
          field.options?.join('|') ?? '',
        ].join(':'),
      )
      .join(';');
  }

  private resetForm(raw: Record<string, unknown> = {}): void {
    const value: Record<string, FeatureFormValue> = {};

    this.fields.forEach((field) => {
      value[field.name] = this.normalizeValue(field, raw[field.name]);
    });

    this.form.reset(value);
    this.updateConditionalValidators();
    this.updateDerivedAmounts();
  }

  private formValue(): Record<string, FeatureFormValue> {
    const raw = this.form.getRawValue();
    const value: Record<string, FeatureFormValue> = {};

    this.fields.forEach((field) => {
      value[field.name] = this.normalizeValue(field, raw[field.name]);
    });

    return value;
  }

  private normalizeValue(field: FeatureFormField, value: unknown): FeatureFormValue {
    if (field.type === 'number') {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : 0;
    }

    if (field.type === 'checkbox') {
      return Boolean(value);
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    return this.defaultValue(field);
  }

  private defaultValue(field: FeatureFormField): FeatureFormValue {
    if (field.type === 'number') {
      return 0;
    }

    if (field.type === 'checkbox') {
      return true;
    }

    return field.options?.[0] ?? '';
  }

  private setupFormBehaviors(): void {
    this.formBehaviorSubscription?.unsubscribe();
    this.updateConditionalValidators();
    this.updateDerivedAmounts();
    this.formBehaviorSubscription = this.form.valueChanges.subscribe(() => {
      this.updateConditionalValidators();
      this.updateDerivedAmounts();
    });
  }

  private updateConditionalValidators(): void {
    this.fields.forEach((field) => {
      if (!field.requiredWhen) {
        return;
      }

      const control = this.form.controls[field.name];

      if (!control) {
        return;
      }

      control.setValidators(this.isRequired(field) ? [Validators.required] : []);
      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  private updateDerivedAmounts(): void {
    const amountControl = this.form.controls['amount'] ?? this.form.controls['monthlyAmount'];
    const paidAmountControl = this.form.controls['paidAmount'];
    const pendingAmountControl = this.form.controls['pendingAmount'];
    const paymentTypeControl = this.form.controls['paymentType'];

    if (!amountControl || !paidAmountControl || !pendingAmountControl) {
      return;
    }

    if (paymentTypeControl?.value === 'Unpaid') {
      const paymentStatusControl = this.form.controls['paymentStatus'];
      const paymentDateControl = this.form.controls['paymentDate'];

      amountControl.setValue(0, { emitEvent: false });
      paidAmountControl.setValue(0, { emitEvent: false });
      pendingAmountControl.setValue(0, { emitEvent: false });
      paymentStatusControl?.setValue('Paid', { emitEvent: false });
      paymentDateControl?.setValue('', { emitEvent: false });
      return;
    }

    const amount = Number(amountControl.value);
    const paidAmount = Number(paidAmountControl.value);
    const nextPendingAmount = Math.max((Number.isFinite(amount) ? amount : 0) - (Number.isFinite(paidAmount) ? paidAmount : 0), 0);

    if (pendingAmountControl.value !== nextPendingAmount) {
      pendingAmountControl.setValue(nextPendingAmount, { emitEvent: false });
      pendingAmountControl.markAsTouched();
    }
  }

  private matchesRequiredWhen(field: FeatureFormField): boolean {
    if (!field.requiredWhen) {
      return false;
    }

    return this.form.controls[field.requiredWhen.field]?.value === field.requiredWhen.value;
  }
}
