import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { PAYMENT_STATUSES } from '../../core/models/expense.model';
import { Funding } from '../../core/models/funding.model';
import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { TEAM_COMPENSATION_TYPES, TEAM_PAYMENT_TYPES, TeamPayment, TeamPaymentInput } from '../../core/models/team-payment.model';
import { FundingService } from '../../core/services/funding.service';
import { PermissionService } from '../../core/services/permission.service';
import { TeamPaymentService } from '../../core/services/team-payment.service';
import { currencyINR } from '../../core/utils/finance-formatters';
import { numberValue, textValue } from '../../core/utils/feature-form-values';
import { fundingAttribution, fundingSourceLabel, fundingSourceOptions } from '../../core/utils/funding-source-options';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-team-payments',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './team-payments.component.html',
})
export class TeamPaymentsComponent {
  private readonly fundingService = inject(FundingService);
  private readonly permissionService = inject(PermissionService);
  private readonly teamPaymentService = inject(TeamPaymentService);
  private readonly funding = toSignal(this.fundingService.list(), { initialValue: [] as Funding[] });
  private readonly teamPayments = toSignal(this.teamPaymentService.list(), { initialValue: [] as TeamPayment[] });

  errorMessage = '';
  isBusy = false;

  get feature(): FeaturePageConfig {
    const records = this.teamPayments();
    const monthlyCommitment = records.reduce((sum, item) => sum + item.monthlyAmount, 0);
    const paid = records.reduce((sum, item) => sum + item.paidAmount, 0);
    const pending = records.reduce((sum, item) => sum + item.pendingAmount, 0);
    const unpaidMembers = records.filter((item) => this.paymentType(item) === 'Unpaid').length;

    return {
      eyebrow: 'Team Payment Tracker',
      title: 'Manage salaries, stipends, and contractors',
      description: 'Track monthly commitments across interns, freelancers, consultants, and early employees.',
      icon: 'users',
      primaryAction: 'Add Payment',
      secondaryAction: 'Realtime',
      formTitle: 'Add team payment',
      emptyTitle: 'No team payments yet',
      emptyDescription: 'Add monthly team commitments so burn rate and runway are accurate.',
      fields: [
        { name: 'personName', label: 'Person name', type: 'text', required: true },
        { name: 'role', label: 'Role', type: 'text', required: true, placeholder: 'Product QA Intern' },
        { name: 'type', label: 'Type', type: 'select', required: true, options: TEAM_PAYMENT_TYPES },
        { name: 'paymentType', label: 'Payment type', type: 'select', required: true, options: TEAM_COMPENSATION_TYPES },
        { name: 'fundingSourceId', label: 'Funding source used', type: 'select', options: fundingSourceOptions(this.funding()), display: 'cards' },
        { name: 'month', label: 'Month', type: 'month', required: true },
        { name: 'monthlyAmount', label: 'Monthly amount', type: 'number', requiredWhen: { field: 'paymentType', value: 'Paid' } },
        { name: 'paidAmount', label: 'Paid amount', type: 'number', requiredWhen: { field: 'paymentType', value: 'Paid' } },
        { name: 'pendingAmount', label: 'Pending amount', type: 'number', readonly: true },
        { name: 'paymentStatus', label: 'Payment status', type: 'select', requiredWhen: { field: 'paymentType', value: 'Paid' }, options: PAYMENT_STATUSES },
        { name: 'paymentDate', label: 'Payment date', type: 'date', requiredWhen: { field: 'paymentType', value: 'Paid' } },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      ],
      stats: [
        { label: 'Team Commitment', value: currencyINR(monthlyCommitment), detail: 'Monthly planned', icon: 'users', tone: 'teal' },
        { label: 'Paid', value: currencyINR(paid), detail: 'Cleared this month', icon: 'check-circle-2', tone: 'emerald' },
        {
          label: 'Pending',
          value: currencyINR(pending),
          detail: unpaidMembers > 0 ? `${unpaidMembers} unpaid contributor${unpaidMembers > 1 ? 's' : ''} tracked` : 'Remaining commitments',
          icon: 'clock-3',
          tone: pending > 0 ? 'amber' : 'emerald',
        },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.teamPayments().map((item) => ({
      id: item.id,
      title: this.paymentType(item) === 'Unpaid' ? `${item.personName} contributor` : `${item.personName} payment`,
      meta: `${item.role} - ${item.type} - ${item.month} - ${fundingSourceLabel(item)}`,
      status: this.paymentType(item) === 'Unpaid' ? 'Active' : item.paymentStatus,
      amount: this.paymentType(item) === 'Unpaid' ? 'Unpaid' : currencyINR(item.monthlyAmount),
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const paymentType = (textValue(event.value, 'paymentType') || 'Paid') as TeamPaymentInput['paymentType'];
    const isUnpaid = paymentType === 'Unpaid';
    const monthlyAmount = isUnpaid ? 0 : numberValue(event.value, 'monthlyAmount');
    const paidAmount = isUnpaid ? 0 : numberValue(event.value, 'paidAmount');
    const payload: TeamPaymentInput = {
      personName: textValue(event.value, 'personName'),
      role: textValue(event.value, 'role'),
      type: textValue(event.value, 'type') as TeamPaymentInput['type'],
      paymentType,
      month: textValue(event.value, 'month'),
      monthlyAmount,
      paidAmount,
      pendingAmount: isUnpaid ? 0 : Math.max(monthlyAmount - paidAmount, 0),
      paymentStatus: isUnpaid ? 'Paid' : textValue(event.value, 'paymentStatus') as TeamPaymentInput['paymentStatus'],
      paymentDate: isUnpaid ? '' : textValue(event.value, 'paymentDate'),
      notes: textValue(event.value, 'notes'),
      ...fundingAttribution(this.funding(), textValue(event.value, 'fundingSourceId')),
    };

    await this.runMutation(() => event.id ? this.teamPaymentService.update(event.id, payload) : this.teamPaymentService.create(payload));
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.teamPaymentService.delete(id));
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
  }

  canEdit(): boolean {
    return this.permissionService.can('manageTeamPayments');
  }

  private async runMutation(action: () => Promise<unknown>): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save team payment.';
    } finally {
      this.isBusy = false;
    }
  }

  private paymentType(item: TeamPayment): TeamPaymentInput['paymentType'] {
    return item.paymentType ?? 'Paid';
  }
}
