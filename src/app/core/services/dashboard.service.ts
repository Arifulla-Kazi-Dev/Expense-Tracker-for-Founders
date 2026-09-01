import { Injectable, inject } from '@angular/core';
import { combineLatest, map, shareReplay } from 'rxjs';

import { DashboardSummary } from '../models/dashboard-summary.model';
import {
  CategorySpend,
  DecisionNote,
  FounderMetric,
  FundingUtilization,
  InsightBar,
  KpiMetric,
  LedgerPayment,
  MonthlyTrendPoint,
  SpendSource,
  Tone,
} from '../models/dashboard.models';
import { Expense, PaymentStatus } from '../models/expense.model';
import { FounderNote } from '../models/founder-note.model';
import { Funding } from '../models/funding.model';
import { RecurringCostCharge } from '../models/recurring-cost-charge.model';
import { RecurringCost } from '../models/recurring-cost.model';
import { StartupCost } from '../models/startup-cost.model';
import { TeamPayment } from '../models/team-payment.model';
import { currencyINR } from '../utils/finance-formatters';
import { fundingTypeIcon, fundingTypeTone } from '../utils/funding-source-options';
import { ExpenseService } from './expense.service';
import { FounderNoteService } from './founder-note.service';
import { FundingService } from './funding.service';
import { RecurringCostChargeService } from './recurring-cost-charge.service';
import { RecurringCostService } from './recurring-cost.service';
import { StartupCostService } from './startup-cost.service';
import { TeamPaymentService } from './team-payment.service';

const MAX_TREND_MONTHS = 120;

export const emptyDashboardSummary: DashboardSummary = {
  totalFunding: 0,
  totalExpenses: 0,
  totalPaid: 0,
  totalPending: 0,
  remainingBalance: 0,
  monthlyBurn: 0,
  monthlyBurnDetail: 'Add paid salaries, recurring costs, or dated spend records.',
  estimatedRunway: 0,
  canCalculateRunway: false,
  runwayLabel: 'Not calculated',
  runwayExplanation: 'Add paid salaries, active recurring costs, or dated spend records to calculate runway.',
  runwayProgress: 0,
  utilizationPercentage: 0,
  activeTeamMembers: 0,
  pendingPaymentsCount: 0,
  upcomingExpensesAmount: 0,
  upcomingExpensesCount: 0,
  founderMetrics: [],
  kpiMetrics: [],
  categorySpends: [],
  ledgerPayments: [],
  allLedgerPayments: [],
  insightBars: [],
  burnTrend: [],
  monthlySpendTrend: [],
  spendSources: [],
  fundingUtilization: [],
  decisionNotes: [],
  hasData: false,
};

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly fundingService = inject(FundingService);
  private readonly expenseService = inject(ExpenseService);
  private readonly teamPaymentService = inject(TeamPaymentService);
  private readonly startupCostService = inject(StartupCostService);
  private readonly recurringCostService = inject(RecurringCostService);
  private readonly recurringCostChargeService = inject(RecurringCostChargeService);
  private readonly founderNoteService = inject(FounderNoteService);

  readonly summary$ = combineLatest([
    this.fundingService.list(),
    this.expenseService.list(),
    this.teamPaymentService.list(),
    this.startupCostService.list(),
    this.recurringCostService.list(),
    this.recurringCostChargeService.list(),
    this.founderNoteService.list(),
  ]).pipe(
    map(([funding, expenses, teamPayments, startupCosts, recurringCosts, recurringCostCharges, notes]) =>
      this.buildSummary(funding, expenses, teamPayments, startupCosts, recurringCosts, recurringCostCharges, notes),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private buildSummary(
    funding: Funding[],
    expenses: Expense[],
    teamPayments: TeamPayment[],
    startupCosts: StartupCost[],
    recurringCosts: RecurringCost[],
    recurringCostCharges: RecurringCostCharge[],
    notes: FounderNote[],
  ): DashboardSummary {
    const totalFunding = sum(funding.map((item) => item.amount));
    const totalExpenseRecords = sum(expenses.map((item) => item.amount));
    const totalTeamPayments = sum(teamPayments.map((item) => item.monthlyAmount));
    const totalStartupCosts = sum(startupCosts.map((item) => item.amount));
    const totalRecurringCosts = sum(recurringCosts.map((item) => item.amount));
    const totalExpenses = totalExpenseRecords + totalTeamPayments + totalStartupCosts + totalRecurringCosts;
    const paidExpense = sumPaid(expenses);
    const paidTeam = sum(teamPayments.map((item) => paidAmount(item.paymentStatus, item.monthlyAmount, item.paidAmount)));
    const paidStartup = sum(startupCosts.map((item) => paidAmount(item.paymentStatus, item.amount, item.paidAmount)));
    const totalRecurringCharged = sum(recurringCostCharges.map((item) => item.amount));
    const totalPaid = paidExpense + paidTeam + paidStartup + totalRecurringCharged;
    const pendingExpense = sumPending(expenses);
    const pendingTeam = sum(teamPayments.map((item) => pendingAmount(item.paymentStatus, item.monthlyAmount, item.pendingAmount)));
    const pendingStartup = sum(startupCosts.map((item) => pendingAmount(item.paymentStatus, item.amount, item.pendingAmount)));
    const totalPending = pendingExpense + pendingTeam + pendingStartup;
    const remainingBalance = Math.max(totalFunding - totalPaid, 0);
    const monthlySpendTrend = this.monthlySpendTrend(expenses, startupCosts, teamPayments, recurringCosts);
    const monthlyRecurring = sum(recurringCosts.filter((item) => item.isActive).map((item) => monthlyEquivalent(item.amount, item.billingCycle)));
    const scheduledMonthlyBurn = monthlyRecurring + totalTeamPayments;
    const observedMonthlyBurn = averageActiveMonthSpend(monthlySpendTrend);
    const monthlyBurn = scheduledMonthlyBurn > 0 ? scheduledMonthlyBurn : observedMonthlyBurn;
    const monthlyBurnDetail = scheduledMonthlyBurn > 0
      ? 'Active recurring + team commitments'
      : monthlyBurn > 0
        ? 'Estimated from average active-month ledger spend'
        : 'Add paid salaries, recurring costs, or dated spend records';
    const canCalculateRunway = monthlyBurn > 0;
    const estimatedRunway = canCalculateRunway ? roundOne(remainingBalance / monthlyBurn) : 0;
    const runwayLabel = canCalculateRunway ? `${estimatedRunway} months` : 'Not calculated';
    const runwayExplanation = canCalculateRunway
      ? scheduledMonthlyBurn > 0
        ? 'Based on active recurring and team commitments'
        : 'Estimated from average active-month ledger spend'
      : 'Add paid salaries, active recurring costs, or dated spend records to calculate runway.';
    const runwayProgress = canCalculateRunway ? Math.min(Math.round((estimatedRunway / 12) * 100), 100) : 0;
    const utilizationPercentage = totalFunding > 0 ? Math.min(roundOne((totalPaid / totalFunding) * 100), 100) : 0;
    const activeTeamMembers = new Set(teamPayments.map((item) => item.personName.trim()).filter(Boolean)).size;
    const pendingPaymentsCount = [
      ...expenses.map((item) => item.paymentStatus),
      ...teamPayments.map((item) => item.paymentStatus),
      ...startupCosts.map((item) => item.paymentStatus),
    ].filter((status) => status !== 'Paid').length;
    const upcomingExpenses = this.upcomingExpenseEntries(expenses, startupCosts, recurringCosts);
    const upcomingExpensesAmount = sum(upcomingExpenses.map((item) => item.amount));
    const hasData = funding.length + expenses.length + teamPayments.length + startupCosts.length + recurringCosts.length + recurringCostCharges.length + notes.length > 0;
    const categorySpends = this.categorySpends(expenses, startupCosts, recurringCosts);
    const insightBars = this.insightBars(categorySpends, totalExpenses);
    const allLedgerPayments = this.ledgerPayments(expenses, teamPayments, startupCosts, recurringCostCharges);
    const decisionNotes = this.decisionNotes(notes);
    const burnTrend = this.normalizedTrend(monthlySpendTrend);
    const fundingUtilization = this.fundingUtilization(funding, expenses, teamPayments, startupCosts, recurringCostCharges);

    return {
      totalFunding,
      totalExpenses,
      totalPaid,
      totalPending,
      remainingBalance,
      monthlyBurn,
      monthlyBurnDetail,
      estimatedRunway,
      canCalculateRunway,
      runwayLabel,
      runwayExplanation,
      runwayProgress,
      utilizationPercentage,
      activeTeamMembers,
      pendingPaymentsCount,
      upcomingExpensesAmount,
      upcomingExpensesCount: upcomingExpenses.length,
      founderMetrics: this.founderMetrics({
        activeTeamMembers,
        canCalculateRunway,
        estimatedRunway,
        monthlyBurn,
        monthlyBurnDetail,
        remainingBalance,
        totalFunding,
        totalPaid,
        totalPending,
        upcomingExpensesAmount,
        upcomingExpensesCount: upcomingExpenses.length,
        utilizationPercentage,
      }),
      kpiMetrics: this.kpiMetrics(totalPaid, totalPending, remainingBalance, utilizationPercentage),
      categorySpends,
      insightBars,
      ledgerPayments: allLedgerPayments.slice(0, 8),
      allLedgerPayments,
      burnTrend,
      monthlySpendTrend,
      spendSources: this.spendSources(totalExpenseRecords, totalStartupCosts, totalTeamPayments, totalRecurringCosts),
      fundingUtilization,
      decisionNotes,
      hasData,
    };
  }

  private founderMetrics(summary: {
    activeTeamMembers: number;
    canCalculateRunway: boolean;
    estimatedRunway: number;
    monthlyBurn: number;
    monthlyBurnDetail: string;
    remainingBalance: number;
    totalFunding: number;
    totalPaid: number;
    totalPending: number;
    upcomingExpensesAmount: number;
    upcomingExpensesCount: number;
    utilizationPercentage: number;
  }): FounderMetric[] {
    const runwayProgress = summary.canCalculateRunway ? Math.min(Math.round((summary.estimatedRunway / 12) * 100), 100) : 0;

    return [
      {
        label: 'Funding Received',
        value: currencyINR(summary.totalFunding),
        detail: 'Total capital recorded in Cloud',
        icon: 'wallet',
        tone: 'teal',
        progress: summary.totalFunding > 0 ? 100 : 0,
      },
      {
        label: 'Funding Utilized',
        value: currencyINR(summary.totalPaid),
        detail: `${summary.utilizationPercentage}% of total capital`,
        icon: 'receipt-indian-rupee',
        tone: 'amber',
        progress: summary.utilizationPercentage,
      },
      {
        label: 'Available Cash',
        value: currencyINR(summary.remainingBalance),
        detail: 'Funding minus paid commitments',
        icon: 'banknote',
        tone: 'emerald',
        progress: summary.totalFunding > 0 ? Math.min(Math.round((summary.remainingBalance / summary.totalFunding) * 100), 100) : 0,
      },
      {
        label: 'Monthly Burn Rate',
        value: currencyINR(summary.monthlyBurn),
        detail: summary.monthlyBurnDetail,
        icon: 'repeat-2',
        tone: 'rose',
        progress: summary.totalFunding > 0 ? Math.min(Math.round((summary.monthlyBurn / summary.totalFunding) * 100), 100) : 0,
      },
      {
        label: 'Runway Remaining',
        value: summary.canCalculateRunway ? `${summary.estimatedRunway} months` : 'Not calculated',
        detail: summary.canCalculateRunway ? 'At the current spending rate' : 'Add monthly or dated spend records',
        icon: 'clock-3',
        tone: 'sky',
        progress: runwayProgress,
      },
      {
        label: 'Active Team Members',
        value: String(summary.activeTeamMembers),
        detail: 'Unique people in team payments',
        icon: 'users',
        tone: 'slate',
        progress: Math.min(summary.activeTeamMembers * 20, 100),
      },
      {
        label: 'Pending Payments',
        value: currencyINR(summary.totalPending),
        detail: `${summary.totalPending > 0 ? 'Open' : 'No'} pending commitments`,
        icon: 'calendar-clock',
        tone: 'amber',
        progress: summary.totalPaid + summary.totalPending > 0 ? Math.round((summary.totalPending / (summary.totalPaid + summary.totalPending)) * 100) : 0,
      },
      {
        label: 'Upcoming Expenses',
        value: currencyINR(summary.upcomingExpensesAmount),
        detail: `${summary.upcomingExpensesCount} due in the next 14 days`,
        icon: 'alert-circle',
        tone: 'rose',
        progress: Math.min(summary.upcomingExpensesCount * 15, 100),
      },
    ];
  }

  private kpiMetrics(totalPaid: number, totalPending: number, remainingBalance: number, utilizationPercentage: number): KpiMetric[] {
    return [
      {
        label: 'Total Paid',
        value: currencyINR(totalPaid),
        detail: 'Cleared from company ledger',
        icon: 'check-circle-2',
        tone: 'emerald',
        change: 'Live',
        direction: 'flat',
      },
      {
        label: 'Total Pending',
        value: currencyINR(totalPending),
        detail: 'Awaiting approval or payment',
        icon: 'calendar-clock',
        tone: totalPending > 0 ? 'amber' : 'emerald',
        change: totalPending > 0 ? 'Review' : 'Clear',
        direction: totalPending > 0 ? 'up' : 'flat',
      },
      {
        label: 'Remaining Balance',
        value: currencyINR(remainingBalance),
        detail: 'Available after paid spend',
        icon: 'shield-check',
        tone: 'sky',
        change: 'Cash',
        direction: 'flat',
      },
      {
        label: 'Utilization',
        value: `${utilizationPercentage}%`,
        detail: 'Paid spend versus funding',
        icon: 'target',
        tone: utilizationPercentage > 75 ? 'rose' : 'teal',
        change: utilizationPercentage > 75 ? 'High' : 'Healthy',
        direction: utilizationPercentage > 75 ? 'up' : 'flat',
      },
    ];
  }

  private categorySpends(expenses: Expense[], startupCosts: StartupCost[], recurringCosts: RecurringCost[]): CategorySpend[] {
    const totals = new Map<string, number>();

    expenses.forEach((item) => addToMap(totals, item.category, item.amount));
    startupCosts.forEach((item) => addToMap(totals, 'Startup Costs', item.amount));
    recurringCosts.forEach((item) => addToMap(totals, item.category || 'Recurring Costs', item.amount));

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, amount], index) => ({
        label,
        amount,
        budget: Math.max(amount, 1),
        icon: categoryIcon(label),
        tone: toneByIndex(index),
      }));
  }

  private insightBars(categorySpends: CategorySpend[], totalExpenses: number): InsightBar[] {
    return categorySpends.map((category) => ({
      label: category.label,
      amount: category.amount,
      value: totalExpenses > 0 ? Math.min(Math.round((category.amount / totalExpenses) * 100), 100) : 0,
      tone: category.tone,
    }));
  }

  private ledgerPayments(
    expenses: Expense[],
    teamPayments: TeamPayment[],
    startupCosts: StartupCost[],
    recurringCostCharges: RecurringCostCharge[],
  ): LedgerPayment[] {
    return [
      ...expenses.map((item) => ({
        id: `expense-${item.id}`,
        title: item.title,
        owner: item.category,
        category: item.expenseType,
        status: item.paymentStatus,
        amount: item.amount,
        due: compactDate(item.dueDate || item.date),
      })),
      ...teamPayments.map((item) => ({
        id: `team-payment-${item.id}`,
        title: `${item.personName} payment`,
        owner: item.role,
        category: item.type,
        status: item.paymentStatus,
        amount: item.monthlyAmount,
        due: compactDate(item.paymentDate),
      })),
      ...startupCosts.map((item) => ({
        id: `startup-cost-${item.id}`,
        title: item.costName,
        owner: 'Startup setup',
        category: 'One-Time',
        status: item.paymentStatus,
        amount: item.amount,
        due: compactDate(item.date),
      })),
      ...recurringCostCharges.map((item) => ({
        id: `recurring-charge-${item.id}`,
        title: `${item.name} (auto-debit)`,
        owner: item.category,
        category: item.billingCycle,
        status: 'Paid' as PaymentStatus,
        amount: item.amount,
        due: compactDate(item.billedDate),
      })),
    ];
  }

  private decisionNotes(notes: FounderNote[]): DecisionNote[] {
    return notes.slice(0, 5).map((note) => ({
      title: note.title,
      priority: note.priority,
      date: compactDate(note.date),
      outcome: note.expectedBenefit || note.decisionReason,
    }));
  }

  private monthlySpendTrend(
    expenses: Expense[],
    startupCosts: StartupCost[],
    teamPayments: TeamPayment[],
    recurringCosts: RecurringCost[],
  ): MonthlyTrendPoint[] {
    const monthlyTotals = new Map<string, number>();
    const datedEntries: Date[] = [];
    const addTrendAmount = (value: string, amount: number, useCurrentMonthFallback = false): void => {
      const date = parseDate(value) ?? (useCurrentMonthFallback ? startOfMonth(new Date()) : null);

      if (!date) {
        return;
      }

      const month = startOfMonth(date);
      addToMap(monthlyTotals, monthKey(month), amount);
      datedEntries.push(month);
    };

    expenses.forEach((item) => addTrendAmount(item.date || item.dueDate, item.amount, true));
    startupCosts.forEach((item) => addTrendAmount(item.date, item.amount, true));
    teamPayments.forEach((item) => addTrendAmount(item.month ? `${item.month}-01` : '', item.monthlyAmount, true));
    recurringCosts
      .filter((item) => item.isActive)
      .forEach((item) => addTrendAmount(item.nextBillingDate, monthlyEquivalent(item.amount, item.billingCycle), true));

    if (!datedEntries.length) {
      const currentYear = new Date().getFullYear();

      return Array.from({ length: 12 }, (_, index) => trendPoint(new Date(currentYear, index, 1), 0));
    }

    const sortedDates = datedEntries.sort((a, b) => a.getTime() - b.getTime());
    const end = sortedDates[sortedDates.length - 1];
    const earliestStart = sortedDates[0];
    const clampedStart = monthsBetween(earliestStart, end) > MAX_TREND_MONTHS
      ? new Date(end.getFullYear(), end.getMonth() - MAX_TREND_MONTHS, 1)
      : earliestStart;
    const points: MonthlyTrendPoint[] = [];
    const cursor = new Date(clampedStart.getFullYear(), clampedStart.getMonth(), 1);

    while (cursor <= end) {
      points.push(trendPoint(cursor, monthlyTotals.get(monthKey(cursor)) ?? 0));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return points;
  }

  private normalizedTrend(points: MonthlyTrendPoint[]): number[] {
    const max = Math.max(...points.map((point) => point.amount), 1);
    return points.map((point) => Math.max(Math.round((point.amount / max) * 100), point.amount > 0 ? 8 : 0));
  }

  private spendSources(expenses: number, startupCosts: number, teamPayments: number, recurringCosts: number): SpendSource[] {
    const sources: SpendSource[] = [
      {
        label: 'Expenses',
        amount: expenses,
        detail: 'General expense records',
        icon: 'receipt-text',
        tone: 'teal',
      },
      {
        label: 'Startup Costs',
        amount: startupCosts,
        detail: 'One-time setup costs',
        icon: 'building-2',
        tone: 'sky',
      },
      {
        label: 'Salaries',
        amount: teamPayments,
        detail: 'Paid team commitments',
        icon: 'users',
        tone: 'emerald',
      },
      {
        label: 'Recurring Costs',
        amount: recurringCosts,
        detail: 'Active subscriptions and tools',
        icon: 'repeat-2',
        tone: 'amber',
      },
    ];

    return sources.filter((source) => source.amount > 0);
  }

  private fundingUtilization(
    funding: Funding[],
    expenses: Expense[],
    teamPayments: TeamPayment[],
    startupCosts: StartupCost[],
    recurringCostCharges: RecurringCostCharge[],
  ): FundingUtilization[] {
    const utilizedBySource = new Map<string, number>();
    const addUtilized = (sourceId: string | undefined, amount: number): void => {
      if (!sourceId || amount <= 0) {
        return;
      }

      addToMap(utilizedBySource, sourceId, amount);
    };

    expenses.forEach((item) => addUtilized(item.fundingSourceId, paidAmount(item.paymentStatus, item.amount, item.paidAmount)));
    teamPayments.forEach((item) => addUtilized(item.fundingSourceId, paidAmount(item.paymentStatus, item.monthlyAmount, item.paidAmount)));
    startupCosts.forEach((item) => addUtilized(item.fundingSourceId, paidAmount(item.paymentStatus, item.amount, item.paidAmount)));
    recurringCostCharges.forEach((item) => addUtilized(item.fundingSourceId, item.amount));

    return funding
      .map((source) => {
        const utilized = utilizedBySource.get(source.id) ?? 0;
        const received = source.amount;
        const remaining = Math.max(received - utilized, 0);
        const utilizationPercentage = received > 0 ? Math.min(roundOne((utilized / received) * 100), 100) : 0;

        return {
          sourceId: source.id,
          sourceName: source.sourceName,
          type: source.type,
          received,
          utilized,
          remaining,
          utilizationPercentage,
          icon: fundingTypeIcon(source.type),
          tone: fundingTypeTone(source.type) as Tone,
        };
      })
      .sort((a, b) => b.received - a.received);
  }

  private upcomingExpenseEntries(expenses: Expense[], startupCosts: StartupCost[], recurringCosts: RecurringCost[]) {
    const today = startOfDay(new Date());
    const twoWeeks = new Date(today);
    twoWeeks.setDate(today.getDate() + 14);

    return [
      ...expenses.map((item) => ({ amount: item.pendingAmount || item.amount, date: item.dueDate || item.date })),
      ...startupCosts.map((item) => ({ amount: item.pendingAmount || item.amount, date: item.date })),
      ...recurringCosts.filter((item) => item.isActive).map((item) => ({ amount: item.amount, date: item.nextBillingDate })),
    ].filter((item) => {
      const date = parseDate(item.date);
      return date ? date >= today && date <= twoWeeks : false;
    });
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function paidAmount(status: PaymentStatus, amount: number, paid: number): number {
  return status === 'Paid' ? amount : paid || 0;
}

function pendingAmount(status: PaymentStatus, amount: number, pending: number): number {
  if (status === 'Paid') {
    return 0;
  }

  return pending || Math.max(amount - paidAmount(status, amount, 0), 0);
}

function sumPaid(items: Expense[]): number {
  return sum(items.map((item) => paidAmount(item.paymentStatus, item.amount, item.paidAmount)));
}

function sumPending(items: Expense[]): number {
  return sum(items.map((item) => pendingAmount(item.paymentStatus, item.amount, item.pendingAmount)));
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

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageActiveMonthSpend(points: MonthlyTrendPoint[]): number {
  const activeMonths = points.map((point) => point.amount).filter((amount) => amount > 0);
  return activeMonths.length ? roundOne(sum(activeMonths) / activeMonths.length) : 0;
}

function addToMap(mapValue: Map<string, number>, key: string, amount: number): void {
  mapValue.set(key, (mapValue.get(key) ?? 0) + amount);
}

function toneByIndex(index: number): Tone {
  return (['teal', 'sky', 'emerald', 'amber', 'slate', 'rose'] as Tone[])[index % 6];
}

function categoryIcon(category: string): string {
  const lowered = category.toLowerCase();

  if (lowered.includes('legal') || lowered.includes('company') || lowered.includes('startup')) {
    return 'building-2';
  }

  if (lowered.includes('team') || lowered.includes('salary') || lowered.includes('intern')) {
    return 'users';
  }

  if (lowered.includes('cloud') || lowered.includes('ai') || lowered.includes('hosting')) {
    return 'circle-gauge';
  }

  if (lowered.includes('marketing') || lowered.includes('user') || lowered.includes('brand')) {
    return 'trending-up';
  }

  return 'receipt-text';
}

function compactDate(value: string): string {
  const date = parseDate(value);

  if (!date) {
    return value || 'Not set';
  }

  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date);
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function trendPoint(date: Date, amount: number): MonthlyTrendPoint {
  const month = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date);

  return {
    month: `${month} ${date.getFullYear()}`,
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    key: monthKey(date),
    amount,
  };
}
