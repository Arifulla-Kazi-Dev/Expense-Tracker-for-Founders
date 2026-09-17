import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_LINKED_EXPENSE_CATEGORIES,
  COMPLIANCE_RECURRENCES,
  ComplianceItem,
  ComplianceItemInput,
  ComplianceRecurrence,
} from '../../core/models/compliance-item.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { Expense } from '../../core/models/expense.model';
import { ComplianceItemService } from '../../core/services/compliance-item.service';
import { ExpenseService } from '../../core/services/expense.service';
import { PermissionService } from '../../core/services/permission.service';
import { computeDueDates, parseIsoDate, toIsoDate } from '../../core/utils/date-cycles';
import { currencyINR } from '../../core/utils/finance-formatters';
import { textValue } from '../../core/utils/feature-form-values';
import { fundingSourceLabel } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';
import { CalendarMarker, CalendarMonthComponent } from '../../shared/components/calendar-month/calendar-month.component';

const MAX_COMPLIANCE_CATCH_UP_CYCLES = 24;
const LINKED_EXPENSE_CATEGORY = COMPLIANCE_LINKED_EXPENSE_CATEGORIES[0];

type ComplianceStatus = 'Overdue' | 'Pending' | 'Done';

@Component({
  selector: 'app-compliance',
  standalone: true,
  imports: [FeaturePageComponent, CalendarMonthComponent],
  templateUrl: './compliance.component.html',
})
export class ComplianceComponent implements OnDestroy {
  private readonly permissionService = inject(PermissionService);
  private readonly complianceService = inject(ComplianceItemService);
  private readonly expenseService = inject(ExpenseService);
  private readonly items = toSignal(this.complianceService.list(), { initialValue: [] as ComplianceItem[] });
  private readonly expenses = toSignal(this.expenseService.list(), { initialValue: [] as Expense[] });
  private toastTimer?: ReturnType<typeof setTimeout>;

  errorMessage = '';
  isBusy = false;
  toastMessage = '';

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  /** Expenses logged with a compliance-relevant category — shown here too (view-only) so nobody has to double-enter what they already logged as an Expense. */
  get linkedExpenses(): Expense[] {
    const linkedCategories: readonly string[] = COMPLIANCE_LINKED_EXPENSE_CATEGORIES;
    return this.expenses().filter((item) => linkedCategories.includes(item.category));
  }

  get feature(): FeaturePageConfig {
    const records = this.items();
    const linked = this.linkedExpenses;
    const today = toIsoDate(new Date());

    const overdue = records.filter((item) => this.statusFor(item, today) === 'Overdue').length
      + linked.filter((item) => this.expenseStatusFor(item, today) === 'Overdue').length;

    const upcoming = records.filter((item) => this.statusFor(item, today) === 'Pending' && daysBetween(today, item.dueDate) <= 30).length
      + linked.filter((item) => {
        if (this.expenseStatusFor(item, today) !== 'Pending') {
          return false;
        }

        const date = item.dueDate || item.date;
        return Boolean(date) && daysBetween(today, date) <= 30;
      }).length;

    return {
      eyebrow: 'Compliance Calendar',
      title: 'Never miss a filing or renewal',
      description: 'Track GST/ROC filings, licenses, and other recurring or one-time regulatory deadlines in one place. Legal & Compliance expenses show up here too.',
      icon: 'shield-check',
      primaryAction: 'Add Item',
      secondaryAction: 'Realtime',
      formTitle: 'Add compliance item',
      emptyTitle: 'No compliance items yet',
      emptyDescription: 'Add filing deadlines, license renewals, and regulatory obligations to track them here.',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'GST Return Filing' },
        { name: 'category', label: 'Category', type: 'select', required: true, options: COMPLIANCE_CATEGORIES },
        { name: 'recurrence', label: 'Recurrence', type: 'select', required: true, options: COMPLIANCE_RECURRENCES },
        {
          name: 'dueDate',
          label: 'Due date',
          type: 'date',
          required: true,
          hint: 'For a recurring item, this is the next (or first) due date — it moves forward automatically whenever you mark it done.',
        },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      ],
      stats: [
        { label: 'Overdue', value: String(overdue), detail: 'Needs attention now', icon: 'alert-circle', tone: overdue > 0 ? 'rose' : 'emerald' },
        { label: 'Due in 30 Days', value: String(upcoming), detail: 'Coming up soon', icon: 'calendar-clock', tone: 'amber' },
        { label: 'Tracked Items', value: String(records.length + linked.length), detail: 'Compliance items + linked expenses', icon: 'shield-check', tone: 'sky' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    const today = toIsoDate(new Date());

    const itemRows: FeaturePageRow[] = this.items().map((item) => {
      const status = this.statusFor(item, today);
      const lastDone = item.completedAt ? ` - Last done ${this.formatDate(item.completedAt)}` : '';

      return {
        id: item.id,
        title: item.title,
        meta: `${item.category} - ${item.recurrence}${lastDone}`,
        status,
        amount: `Due ${this.formatDate(item.dueDate)}`,
        raw: item as unknown as Record<string, unknown>,
        toggleAction: status === 'Done' ? undefined : { label: 'Mark done', icon: 'check-circle-2' },
        linkAction: {
          label: 'Log cost as expense',
          icon: 'receipt-text',
          route: '/expenses',
          queryParams: { prefillTitle: item.title, prefillCategory: LINKED_EXPENSE_CATEGORY },
        },
      };
    });

    const expenseRows: FeaturePageRow[] = this.linkedExpenses.map((item) => ({
      id: item.id,
      title: item.title,
      meta: `${item.category} - ${item.date || 'Date not set'} - ${fundingSourceLabel(item)}`,
      status: this.expenseStatusFor(item, today),
      amount: currencyINR(item.amount),
      lockedLabel: 'From Expenses',
    }));

    return [...itemRows, ...expenseRows];
  }

  get calendarMarkers(): CalendarMarker[] {
    const today = toIsoDate(new Date());

    const itemMarkers: CalendarMarker[] = this.items()
      .filter((item) => this.statusFor(item, today) !== 'Done')
      .map((item) => ({
        date: item.dueDate,
        tone: this.statusFor(item, today) === 'Overdue' ? 'rose' : 'amber',
        label: item.title,
      }));

    const expenseMarkers: CalendarMarker[] = this.linkedExpenses
      .filter((item) => this.expenseStatusFor(item, today) !== 'Done' && Boolean(item.dueDate || item.date))
      .map((item) => ({
        date: item.dueDate || item.date,
        tone: this.expenseStatusFor(item, today) === 'Overdue' ? 'rose' : 'sky',
        label: `${item.title} (expense)`,
      }));

    return [...itemMarkers, ...expenseMarkers];
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const existing = event.id ? this.items().find((item) => item.id === event.id) : null;
    const payload: ComplianceItemInput = {
      title: textValue(event.value, 'title'),
      category: textValue(event.value, 'category'),
      recurrence: textValue(event.value, 'recurrence') as ComplianceRecurrence,
      dueDate: textValue(event.value, 'dueDate'),
      notes: textValue(event.value, 'notes'),
      completedAt: existing?.completedAt ?? null,
    };

    await this.runMutation(
      () => event.id ? this.complianceService.update(event.id, payload) : this.complianceService.create(payload),
      event.id ? 'Compliance item updated' : 'Compliance item added',
    );
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.complianceService.delete(id), 'Compliance item deleted');
  }

  async markDone(id: string): Promise<void> {
    const item = this.items().find((entry) => entry.id === id);

    if (!item) {
      return;
    }

    const today = toIsoDate(new Date());
    const recurrence = item.recurrence;
    const nextDueDate = recurrence === 'One-Time'
      ? item.dueDate
      : computeDueDates(item.dueDate, recurrence, today, MAX_COMPLIANCE_CATCH_UP_CYCLES).nextDate;

    const payload: ComplianceItemInput = {
      title: item.title,
      category: item.category,
      recurrence: item.recurrence,
      dueDate: nextDueDate,
      notes: item.notes,
      completedAt: today,
    };

    await this.runMutation(() => this.complianceService.update(id, payload), 'Marked done');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Compliance items update automatically.');
  }

  canEdit(): boolean {
    return this.permissionService.can('manageCompliance');
  }

  formatDate(value: string): string {
    const date = parseIsoDate(value);
    return date
      ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
      : value;
  }

  private statusFor(item: ComplianceItem, today: string): ComplianceStatus {
    if (item.recurrence === 'One-Time' && item.completedAt) {
      return 'Done';
    }

    return item.dueDate < today ? 'Overdue' : 'Pending';
  }

  private expenseStatusFor(item: Expense, today: string): ComplianceStatus {
    if (item.paymentStatus === 'Paid') {
      return 'Done';
    }

    const date = item.dueDate || item.date;
    return date && date < today ? 'Overdue' : 'Pending';
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save compliance item.';
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

function daysBetween(fromIso: string, toIsoValue: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIsoValue);

  if (!from || !to) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
