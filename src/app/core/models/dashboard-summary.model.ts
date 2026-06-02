import type {
  CategorySpend,
  DecisionNote,
  FounderMetric,
  InsightBar,
  KpiMetric,
  LedgerPayment,
  MonthlyTrendPoint,
  SpendSource,
} from './dashboard.models';

export interface DashboardSummary {
  totalFunding: number;
  totalExpenses: number;
  totalPaid: number;
  totalPending: number;
  remainingBalance: number;
  monthlyBurn: number;
  estimatedRunway: number;
  utilizationPercentage: number;
  activeTeamMembers: number;
  pendingPaymentsCount: number;
  upcomingExpensesAmount: number;
  upcomingExpensesCount: number;
  founderMetrics: FounderMetric[];
  kpiMetrics: KpiMetric[];
  categorySpends: CategorySpend[];
  ledgerPayments: LedgerPayment[];
  insightBars: InsightBar[];
  burnTrend: number[];
  monthlySpendTrend: MonthlyTrendPoint[];
  spendSources: SpendSource[];
  decisionNotes: DecisionNote[];
  hasData: boolean;
}
