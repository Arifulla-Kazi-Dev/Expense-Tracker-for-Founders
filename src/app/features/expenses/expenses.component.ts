import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { EXPENSE_CATEGORIES, EXPENSE_TYPES, Expense, ExpenseInput, PAYMENT_STATUSES } from '../../core/models/expense.model';
import { Funding } from '../../core/models/funding.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { ExpenseService } from '../../core/services/expense.service';
import { FundingService } from '../../core/services/funding.service';
import { PermissionService } from '../../core/services/permission.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingAttribution, fundingSourceLabel, fundingSourceOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './expenses.component.html',
})
export class ExpensesComponent implements OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly fundingService = inject(FundingService);
  private readonly permissionService = inject(PermissionService);
  private readonly expenses = toSignal(this.expenseService.list(), { initialValue: [] as Expense[] });
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
    const records = this.expenses();
    const total = records.reduce((sum, item) => sum + item.amount, 0);
    const pending = records.reduce((sum, item) => sum + item.pendingAmount, 0);
    const categories = new Set(records.map((item) => item.category)).size;

    return {
      eyebrow: 'Expense Manager',
      title: 'Control paid, pending, and recurring expenses',
      description: 'Classify every expense by category, due date, paid amount, funding source, and workspace decision note.',
      icon: 'receipt-text',
      primaryAction: 'Add Expense',
      secondaryAction: 'Realtime',
      formTitle: 'Add expense',
      emptyTitle: 'No expenses recorded',
      emptyDescription: 'Create expenses to power paid, pending, category, and runway reporting.',
      fields: [
        { name: 'title', label: 'Expense title', type: 'text', required: true, placeholder: 'Market validation sprint' },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'category', label: 'Category', type: 'select', required: true, options: EXPENSE_CATEGORIES },
        { name: 'paymentStatus', label: 'Payment status', type: 'select', required: true, options: PAYMENT_STATUSES },
        { name: 'expenseType', label: 'Expense type', type: 'select', required: true, options: EXPENSE_TYPES },
        { name: 'fundingSourceId', label: 'Funding source used', type: 'select', options: fundingSourceOptions(this.funding()), display: 'cards' },
        { name: 'date', label: 'Expense date', type: 'date', required: true },
        { name: 'dueDate', label: 'Due date', type: 'date', requiredWhen: { field: 'expenseType', value: 'Recurring' } },
        { name: 'paidAmount', label: 'Paid amount', type: 'number', required: true },
        { name: 'pendingAmount', label: 'Pending amount', type: 'number', required: true, readonly: true, placeholder: 'Auto-calculated' },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, placeholder: 'Reason, expected benefit, or vendor details' },
      ],
      stats: [
        { label: 'Total Expenses', value: currencyINR(total), detail: 'Paid + pending records', icon: 'receipt-indian-rupee', tone: 'amber' },
        { label: 'Pending', value: currencyINR(pending), detail: 'Open commitment amount', icon: 'calendar-clock', tone: pending > 0 ? 'rose' : 'emerald' },
        { label: 'Categories', value: String(categories), detail: 'Tracked spend groups', icon: 'layers-3', tone: 'sky' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.expenses().map((item) => ({
      id: item.id,
      title: item.title,
      meta: `${item.dueDate ? `${item.category} - Due ${item.dueDate}` : `${item.category} - ${item.date || 'No due date'}`} - ${fundingSourceLabel(item)}`,
      status: item.paymentStatus,
      amount: currencyINR(item.amount),
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const amount = numberValue(event.value, 'amount');
    const paidAmount = numberValue(event.value, 'paidAmount');
    const pendingAmount = numberValue(event.value, 'pendingAmount') || Math.max(amount - paidAmount, 0);
    const payload: ExpenseInput = {
      title: textValue(event.value, 'title'),
      amount,
      category: textValue(event.value, 'category'),
      paymentStatus: textValue(event.value, 'paymentStatus') as ExpenseInput['paymentStatus'],
      expenseType: textValue(event.value, 'expenseType') as ExpenseInput['expenseType'],
      date: textValue(event.value, 'date'),
      dueDate: textValue(event.value, 'dueDate'),
      paidAmount,
      pendingAmount,
      notes: textValue(event.value, 'notes'),
      ...fundingAttribution(this.funding(), textValue(event.value, 'fundingSourceId')),
    };

    await this.runMutation(
      () => event.id ? this.expenseService.update(event.id, payload) : this.expenseService.create(payload),
      event.id ? 'Expense updated' : 'Expense saved',
    );
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.expenseService.delete(id), 'Expense deleted');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Expense records update automatically.');
  }

  canEdit(): boolean {
    return this.permissionService.can('manageExpenses');
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save expense record.';
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
