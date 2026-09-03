import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { Subscription } from 'rxjs';

import { FeatureFormField, FeatureFormOption, FeaturePageConfig, FeaturePageRow, Tone } from '../../../core/models/dashboard.models';
import { badgeClass, tonePanelClass } from '../../../core/utils/ui-classnames';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

export type FeatureFormValue = string | number | boolean;

export interface FeatureSaveEvent {
  id: string | null;
  value: Record<string, FeatureFormValue>;
}

@Component({
  selector: 'app-feature-page',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent, LucideDynamicIcon, ReactiveFormsModule],
  templateUrl: './feature-page.component.html',
  styleUrl: './feature-page.component.css',
})
export class FeaturePageComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) feature!: FeaturePageConfig;
  @Input() rows: FeaturePageRow[] = [];
  @Input() errorMessage = '';
  @Input() isBusy = false;
  @Input() canEdit = true;
  @Input() toastMessage = '';

  @Output() saveRecord = new EventEmitter<FeatureSaveEvent>();
  @Output() deleteRecord = new EventEmitter<string>();
  @Output() secondaryAction = new EventEmitter<void>();
  @Output() toggleRecord = new EventEmitter<string>();

  form = new FormGroup<Record<string, FormControl<FeatureFormValue>>>({});
  editingRow: FeaturePageRow | null = null;
  pendingDeleteRow: FeaturePageRow | null = null;
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
    if (!this.canEdit) {
      return;
    }

    this.editingRow = null;
    this.resetForm();
    this.isModalOpen = true;
  }

  openEditModal(row: FeaturePageRow): void {
    if (!this.canEdit || row.lockedLabel) {
      return;
    }

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
    if (!this.canEdit || this.form.invalid || this.isBusy) {
      this.form.markAllAsTouched();
      return;
    }

    this.saveRecord.emit({
      id: this.editingRow?.id ?? null,
      value: this.formValue(),
    });
    this.closeModal();
  }

  emitToggle(row: FeaturePageRow): void {
    if (!this.canEdit || !row.id || this.isBusy || row.lockedLabel) {
      return;
    }

    this.toggleRecord.emit(row.id);
  }

  requestDelete(row: FeaturePageRow): void {
    if (!this.canEdit || !row.id || this.isBusy || row.lockedLabel) {
      return;
    }

    this.pendingDeleteRow = row;
  }

  cancelDelete(): void {
    this.pendingDeleteRow = null;
  }

  confirmDelete(): void {
    const row = this.pendingDeleteRow;

    if (!row?.id || this.isBusy) {
      return;
    }

    this.deleteRecord.emit(row.id);
    this.pendingDeleteRow = null;
  }

  isInvalid(field: FeatureFormField): boolean {
    const control = this.form.controls[field.name];
    return Boolean(control?.invalid && control.touched);
  }

  fieldErrorMessage(field: FeatureFormField): string {
    const control = this.form.controls[field.name];

    if (control?.errors?.['min']) {
      return `${field.label} cannot be negative.`;
    }

    return `${field.label} is required.`;
  }

  isRequired(field: FeatureFormField): boolean {
    return Boolean(field.required || this.matchesRequiredWhen(field));
  }

  isCategoryField(field: FeatureFormField): boolean {
    return field.type === 'select' && field.name.toLowerCase().includes('category');
  }

  isCardSelectField(field: FeatureFormField): boolean {
    return field.type === 'select' && field.display !== 'select';
  }

  isSelectedOption(field: FeatureFormField, option: string | FeatureFormOption): boolean {
    return this.form.controls[field.name]?.value === this.optionValue(option);
  }

  selectOption(field: FeatureFormField, option: string | FeatureFormOption): void {
    const control = this.form.controls[field.name];

    if (!control || this.isBusy) {
      return;
    }

    control.setValue(this.optionValue(option));
    control.markAsDirty();
    control.markAsTouched();
  }

  optionClass(field: FeatureFormField, option: string | FeatureFormOption): string {
    if (this.isSelectedOption(field, option)) {
      return 'border-violet-300 bg-violet-50 text-violet-950 ring-2 ring-violet-500/20 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-100';
    }

    return 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800';
  }

  optionValue(option: string | FeatureFormOption): string {
    return typeof option === 'string' ? option : option.value;
  }

  optionLabel(option: string | FeatureFormOption): string {
    return typeof option === 'string' ? option : option.label;
  }

  optionDetail(option: string | FeatureFormOption): string {
    if (typeof option !== 'string') {
      return option.detail ?? '';
    }

    const value = option.toLowerCase();

    if (value === 'paid') {
      return 'Cleared spend';
    }

    if (value === 'pending') {
      return 'Still payable';
    }

    if (value.includes('partial')) {
      return 'Some amount paid';
    }

    if (value.includes('recurring')) {
      return 'Repeats over time';
    }

    if (value.includes('one-time')) {
      return 'Single payment';
    }

    return '';
  }

  optionIcon(option: string | FeatureFormOption): string {
    if (typeof option !== 'string' && option.icon) {
      return option.icon;
    }

    const value = this.optionLabel(option).toLowerCase();

    if (value === 'paid') {
      return 'check-circle-2';
    }

    if (value === 'pending') {
      return 'calendar-clock';
    }

    if (value.includes('partial')) {
      return 'circle-gauge';
    }

    if (value.includes('monthly') || value.includes('quarterly') || value.includes('yearly') || value.includes('recurring')) {
      return 'repeat-2';
    }

    if (value.includes('one-time')) {
      return 'badge-indian-rupee';
    }

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

  optionToneClass(option: string | FeatureFormOption): string {
    return tonePanelClass(this.optionTone(option));
  }

  tonePanelClass(tone: Tone): string {
    return tonePanelClass(tone);
  }

  private optionTone(option: string | FeatureFormOption): Tone {
    if (typeof option !== 'string') {
      return option.tone ?? 'slate';
    }

    const value = option.toLowerCase();

    if (value === 'paid' || value === 'active') {
      return 'emerald';
    }

    if (value === 'pending' || value.includes('partial') || value.includes('quarterly')) {
      return 'amber';
    }

    if (value.includes('recurring') || value.includes('monthly') || value.includes('yearly')) {
      return 'sky';
    }

    if (value.includes('legal') || value.includes('company') || value.includes('startup')) {
      return 'teal';
    }

    if (value.includes('marketing') || value.includes('user') || value.includes('brand')) {
      return 'rose';
    }

    return 'slate';
  }

  badgeClass(status: FeaturePageConfig['rows'][number]['status']): string {
    return badgeClass(status);
  }

  secondaryIcon(): string {
    return this.feature.secondaryAction.toLowerCase().includes('real')
      ? 'repeat-2'
      : 'download';
  }

  private buildForm(): void {
    const controls: Record<string, FormControl<FeatureFormValue>> = {};

    this.fields.forEach((field) => {
      controls[field.name] = new FormControl<FeatureFormValue>(this.defaultValue(field), {
        nonNullable: true,
        validators: this.fieldValidators(field, Boolean(field.required)),
      });
    });

    this.form = new FormGroup(controls);
    this.setupFormBehaviors();
  }

  private fieldValidators(field: FeatureFormField, required: boolean) {
    const validators = required ? [Validators.required] : [];
    return field.type === 'number' ? [...validators, Validators.min(0)] : validators;
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
          field.display ?? '',
          field.options?.map((option) => this.optionSignature(option)).join('|') ?? '',
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

    return field.options?.[0] ? this.optionValue(field.options[0]) : '';
  }

  private optionSignature(option: string | FeatureFormOption): string {
    return typeof option === 'string'
      ? option
      : `${option.value}:${option.label}:${option.detail ?? ''}:${option.icon ?? ''}:${option.tone ?? ''}`;
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

      control.setValidators(this.fieldValidators(field, this.isRequired(field)));
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
