import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { FUNDING_TYPES, Funding, FundingInput } from '../../core/models/funding.model';
import { FundingService } from '../../core/services/funding.service';
import { PermissionService } from '../../core/services/permission.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingTypeOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-funding',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './funding.component.html',
})
export class FundingComponent implements OnDestroy {
  private readonly fundingService = inject(FundingService);
  private readonly permissionService = inject(PermissionService);
  private readonly funding = toSignal(this.fundingService.list(), { initialValue: [] as Funding[] });
  private toastTimer?: ReturnType<typeof setTimeout>;

  errorMessage = '';
  isBusy = false;
  toastMessage = '';

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  get feature(): FeaturePageConfig {
    const records = this.funding();
    const totalFunding = records.reduce((total, item) => total + item.amount, 0);

    return {
      eyebrow: 'Funding Manager',
      title: 'Track every source of company capital',
      description: 'Record grants, investor checks, owner contributions, revenue, credit lines, and notes against the funding source.',
      icon: 'wallet',
      primaryAction: 'Add Funding',
      secondaryAction: 'Realtime',
      formTitle: 'Add funding source',
      emptyTitle: 'No funding sources yet',
      emptyDescription: 'Add your first funding source so dashboard runway and utilization can calculate from Cloud.',
      fields: [
        { name: 'sourceName', label: 'Source name', type: 'text', required: true, placeholder: 'CIBA Pre-seed Funding' },
        { name: 'amount', label: 'Amount', type: 'number', required: true, placeholder: '200000' },
        { name: 'dateReceived', label: 'Date received', type: 'date', required: true },
        { name: 'type', label: 'Funding type', type: 'select', required: true, options: fundingTypeOptions(FUNDING_TYPES), display: 'cards' },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'Context, terms, or milestone notes' },
      ],
      stats: [
        { label: 'Total Funding', value: currencyINR(totalFunding), detail: `${records.length} funding source${records.length === 1 ? '' : 's'}`, icon: 'banknote', tone: 'teal' },
        { label: 'Largest Source', value: currencyINR(Math.max(...records.map((item) => item.amount), 0)), detail: 'Highest capital line', icon: 'wallet', tone: 'emerald' },
        { label: 'Funding Events', value: String(records.length), detail: 'Stored under company workspace', icon: 'database', tone: 'sky' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.funding().map((item) => ({
      id: item.id,
      title: item.sourceName,
      meta: `${item.type} - ${item.dateReceived || 'Date not set'}`,
      status: 'Active',
      amount: currencyINR(item.amount),
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const payload: FundingInput = {
      sourceName: textValue(event.value, 'sourceName'),
      amount: numberValue(event.value, 'amount'),
      dateReceived: textValue(event.value, 'dateReceived'),
      type: textValue(event.value, 'type') as FundingInput['type'],
      notes: textValue(event.value, 'notes'),
    };

    await this.runMutation(
      () => event.id ? this.fundingService.update(event.id, payload) : this.fundingService.create(payload),
      event.id ? 'Funding source updated' : 'Funding source saved',
    );
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.fundingService.delete(id), 'Funding source deleted');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Funding records update automatically.');
  }

  canEdit(): boolean {
    return this.permissionService.can('manageFunding');
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save funding record.';
    } finally {
      this.isBusy = false;
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2400);
  }
}
