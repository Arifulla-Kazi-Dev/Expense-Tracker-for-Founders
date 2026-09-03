import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideDynamicIcon } from '@lucide/angular';

import { BILLING_CYCLES, RecurringCost, RecurringCostInput } from '../../core/models/recurring-cost.model';
import { RecurringCostCharge } from '../../core/models/recurring-cost-charge.model';
import { EXPENSE_CATEGORIES } from '../../core/models/expense.model';
import { Funding } from '../../core/models/funding.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { FundingService } from '../../core/services/funding.service';
import { PermissionService } from '../../core/services/permission.service';
import { RecurringBillingService, toIsoDate } from '../../core/services/recurring-billing.service';
import { RecurringCostChargeService } from '../../core/services/recurring-cost-charge.service';
import { RecurringCostService } from '../../core/services/recurring-cost.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { badgeClass } from '../../core/utils/ui-classnames';
import { booleanValue, numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingAttribution, fundingSourceLabel, fundingSourceOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-recurring-costs',
  standalone: true,
  imports: [FeaturePageComponent, LucideDynamicIcon],
  templateUrl: './recurring-costs.component.html',
})
export class RecurringCostsComponent implements OnDestroy {
  private readonly fundingService = inject(FundingService);
  private readonly permissionService = inject(PermissionService);
  private readonly recurringCostService = inject(RecurringCostService);
  private readonly recurringCostChargeService = inject(RecurringCostChargeService);
  private readonly recurringBillingService = inject(RecurringBillingService);
  private readonly funding = toSignal(this.fundingService.list(), { initialValue: [] as Funding[] });
  private readonly recurringCosts = toSignal(this.recurringCostService.list(), { initialValue: [] as RecurringCost[] });
  private readonly recurringCostCharges = toSignal(this.recurringCostChargeService.list(), { initialValue: [] as RecurringCostCharge[] });
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
        {
          name: 'nextBillingDate',
          label: 'Started on',
          type: 'date',
          required: true,
          hint: 'When this cost first started billing — past dates are fine, missed months are billed automatically. Wrong date? Just edit it here.',
        },
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
      toggleAction: item.isActive
        ? { label: 'Pause billing', icon: 'pause' }
        : { label: 'Resume billing', icon: 'play' },
    }));
  }

  get recentCharges(): RecurringCostCharge[] {
    return [...this.recurringCostCharges()]
      .sort((a, b) => b.billedDate.localeCompare(a.billedDate))
      .slice(0, 10);
  }

  chargeAmount(charge: RecurringCostCharge): string {
    return currencyINR(charge.amount);
  }

  chargeDate(billedDate: string): string {
    const date = new Date(`${billedDate}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? billedDate
      : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  chargeFundingLabel(charge: RecurringCostCharge): string {
    return fundingSourceLabel(charge);
  }

  paidBadgeClass(): string {
    return badgeClass('Paid');
  }

  async deleteCharge(id: string): Promise<void> {
    await this.runMutation(() => this.recurringCostChargeService.delete(id), 'Auto-debit removed');
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

    if (!this.errorMessage) {
      // Bill immediately instead of waiting for the next login, so a
      // backdated start date shows its catch-up charges and updated
      // Available Cash right away.
      this.recurringBillingService.runCatchUpBilling().catch((error) => {
        console.error('Recurring cost auto-billing failed', error);
      });
    }
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.recurringCostService.delete(id), 'Recurring cost deleted');
  }

  async toggleActive(id: string): Promise<void> {
    const item = this.recurringCosts().find((cost) => cost.id === id);

    if (!item) {
      return;
    }

    const resuming = !item.isActive;
    // Pausing simply stops billing (already skipped by the billing engine while
    // inactive). Resuming restarts from today instead of the old next-billing-date,
    // so it never retroactively bills for the months it was paused.
    const payload: RecurringCostInput = {
      name: item.name,
      amount: item.amount,
      billingCycle: item.billingCycle,
      category: item.category,
      nextBillingDate: resuming ? toIsoDate(new Date()) : item.nextBillingDate,
      isActive: resuming,
      notes: item.notes,
      ...fundingAttribution(this.funding(), item.fundingSourceId ?? ''),
    };

    await this.runMutation(
      () => this.recurringCostService.update(id, payload),
      resuming ? 'Recurring cost resumed - billing restarts today' : 'Recurring cost paused',
    );

    if (!this.errorMessage && resuming) {
      this.recurringBillingService.runCatchUpBilling().catch((error) => {
        console.error('Recurring cost auto-billing failed', error);
      });
    }
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
