import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { BILLING_CYCLES, RecurringCost, RecurringCostInput } from '../../core/models/recurring-cost.model';
import { EXPENSE_CATEGORIES } from '../../core/models/expense.model';
import { Funding } from '../../core/models/funding.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { FundingService } from '../../core/services/funding.service';
import { PermissionService } from '../../core/services/permission.service';
import { RecurringCostService } from '../../core/services/recurring-cost.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { booleanValue, numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingAttribution, fundingSourceLabel, fundingSourceOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-recurring-costs',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './recurring-costs.component.html',
})
export class RecurringCostsComponent implements OnDestroy {
  private readonly fundingService = inject(FundingService);
  private readonly permissionService = inject(PermissionService);
  private readonly recurringCostService = inject(RecurringCostService);
  private readonly funding = toSignal(this.fundingService.list(), { initialValue: [] as Funding[] });
  private readonly recurringCosts = toSignal(this.recurringCostService.list(), { initialValue: [] as RecurringCost[] });
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
    const records = this.recurringCosts();
    const activeRecords = records.filter((item) => item.isActive);
    const monthlyRecurring = activeRecords.reduce((sum, item) => sum + monthlyEquivalent(item.amount, item.billingCycle), 0);

    return {
      eyebrow: 'Recurring Cost Tracker',
      title: 'Understand monthly burn before it compounds',
      description: 'Monitor subscriptions, cloud, hosting, internet, and compliance retainers with next-month projections.',
      icon: 'repeat-2',
      primaryAction: 'Add Recurring',
      secondaryAction: 'Realtime',
      formTitle: 'Add recurring cost',
      emptyTitle: 'No recurring costs yet',
      emptyDescription: 'Add subscriptions and monthly costs to make burn rate and runway realistic.',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Codex' },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'billingCycle', label: 'Billing cycle', type: 'select', required: true, options: BILLING_CYCLES },
        { name: 'category', label: 'Category', type: 'select', required: true, options: EXPENSE_CATEGORIES },
        { name: 'fundingSourceId', label: 'Funding source used', type: 'select', options: fundingSourceOptions(this.funding()), display: 'cards' },
        { name: 'nextBillingDate', label: 'Next billing date', type: 'date', required: true },
        { name: 'isActive', label: 'Active', type: 'checkbox', placeholder: 'Include in monthly burn' },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      ],
      stats: [
        { label: 'Monthly Recurring', value: currencyINR(monthlyRecurring), detail: 'Monthly equivalent from active costs', icon: 'repeat-2', tone: 'rose' },
        { label: 'Projected Yearly', value: currencyINR(monthlyRecurring * 12), detail: 'At current plan', icon: 'line-chart', tone: 'sky' },
        { label: 'Active Costs', value: String(activeRecords.length), detail: 'Included in burn rate', icon: 'calendar-clock', tone: 'amber' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.recurringCosts().map((item) => ({
      id: item.id,
      title: item.name,
      meta: `${item.category} - ${item.billingCycle} - ${fundingSourceLabel(item)}`,
      status: item.isActive ? 'Active' : 'Inactive',
      amount: currencyINR(item.amount),
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const payload: RecurringCostInput = {
      name: textValue(event.value, 'name'),
      amount: numberValue(event.value, 'amount'),
      billingCycle: textValue(event.value, 'billingCycle') as RecurringCostInput['billingCycle'],
      category: textValue(event.value, 'category'),
      nextBillingDate: textValue(event.value, 'nextBillingDate'),
      isActive: booleanValue(event.value, 'isActive'),
      notes: textValue(event.value, 'notes'),
      ...fundingAttribution(this.funding(), textValue(event.value, 'fundingSourceId')),
    };

    await this.runMutation(
      () => event.id ? this.recurringCostService.update(event.id, payload) : this.recurringCostService.create(payload),
      event.id ? 'Recurring cost updated' : 'Recurring cost saved',
    );
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.recurringCostService.delete(id), 'Recurring cost deleted');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Recurring costs update automatically.');
  }

  canEdit(): boolean {
    return this.permissionService.can('manageRecurringCosts');
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save recurring cost.';
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

function monthlyEquivalent(amount: number, billingCycle: string): number {
  if (billingCycle === 'Quarterly') {
    return amount / 3;
  }

  if (billingCycle === 'Yearly') {
    return amount / 12;
  }

  return amount;
}
