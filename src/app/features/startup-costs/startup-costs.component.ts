import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { PAYMENT_STATUSES } from '../../core/models/expense.model';
import { Funding } from '../../core/models/funding.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { StartupCost, StartupCostInput } from '../../core/models/startup-cost.model';
import { FundingService } from '../../core/services/funding.service';
import { StartupCostService } from '../../core/services/startup-cost.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingAttribution, fundingSourceLabel, fundingSourceOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-startup-costs',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './startup-costs.component.html',
})
export class StartupCostsComponent {
  private readonly fundingService = inject(FundingService);
  private readonly startupCostService = inject(StartupCostService);
  private readonly funding = toSignal(this.fundingService.list(), { initialValue: [] as Funding[] });
  private readonly startupCosts = toSignal(this.startupCostService.list(), { initialValue: [] as StartupCost[] });

  errorMessage = '';
  isBusy = false;

  get feature(): FeaturePageConfig {
    const records = this.startupCosts();
    const total = records.reduce((sum, item) => sum + item.amount, 0);
    const paid = records.reduce((sum, item) => sum + item.paidAmount, 0);
    const openItems = records.filter((item) => item.paymentStatus !== 'Paid').length;

    return {
      eyebrow: 'One-Time Startup Costs',
      title: 'Track permanent company setup costs',
      description: 'Keep company registration, valuation, legal, trademark, domain, and compliance setup in one ledger.',
      icon: 'building-2',
      primaryAction: 'Add Cost',
      secondaryAction: 'Realtime',
      formTitle: 'Add startup cost',
      emptyTitle: 'No startup costs yet',
      emptyDescription: 'Add company setup costs so compliance and one-time spend are reflected in reports.',
      fields: [
        { name: 'costName', label: 'Cost name', type: 'text', required: true, placeholder: 'Company registration' },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'paymentStatus', label: 'Payment status', type: 'select', required: true, options: PAYMENT_STATUSES },
        { name: 'fundingSourceId', label: 'Funding source used', type: 'select', options: fundingSourceOptions(this.funding()), display: 'cards' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'paidAmount', label: 'Paid amount', type: 'number', required: true },
        { name: 'pendingAmount', label: 'Pending amount', type: 'number', required: true },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      ],
      stats: [
        { label: 'Setup Budget', value: currencyINR(total), detail: 'Total company setup spend', icon: 'building-2', tone: 'sky' },
        { label: 'Paid Setup', value: currencyINR(paid), detail: 'Cleared invoices', icon: 'check-circle-2', tone: 'emerald' },
        { label: 'Open Items', value: String(openItems), detail: 'Compliance queue', icon: 'file-text', tone: openItems > 0 ? 'amber' : 'emerald' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.startupCosts().map((item) => ({
      id: item.id,
      title: item.costName,
      meta: `Startup setup - ${item.date || 'Date not set'} - ${fundingSourceLabel(item)}`,
      status: item.paymentStatus,
      amount: currencyINR(item.amount),
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const amount = numberValue(event.value, 'amount');
    const paidAmount = numberValue(event.value, 'paidAmount');
    const payload: StartupCostInput = {
      costName: textValue(event.value, 'costName'),
      amount,
      paymentStatus: textValue(event.value, 'paymentStatus') as StartupCostInput['paymentStatus'],
      date: textValue(event.value, 'date'),
      paidAmount,
      pendingAmount: numberValue(event.value, 'pendingAmount') || Math.max(amount - paidAmount, 0),
      notes: textValue(event.value, 'notes'),
      ...fundingAttribution(this.funding(), textValue(event.value, 'fundingSourceId')),
    };

    await this.runMutation(() => event.id ? this.startupCostService.update(event.id, payload) : this.startupCostService.create(payload));
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.startupCostService.delete(id));
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
  }

  private async runMutation(action: () => Promise<unknown>): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save startup cost.';
    } finally {
      this.isBusy = false;
    }
  }
}
