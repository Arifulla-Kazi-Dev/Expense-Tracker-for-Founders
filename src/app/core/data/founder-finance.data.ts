import {
  CategorySpend,
  DecisionNote,
  FeaturePageConfig,
  FounderMetric,
  InsightBar,
  KpiMetric,
  LedgerPayment,
} from '../models/dashboard.models';
import { currencyINR } from '../utils/finance-formatters';

export const runwayMonths = 8.4;
export const utilizationPercentage = 59.2;
export const monthlyBurn = 9700;
export const availableCash = 81600;

export const founderMetrics: FounderMetric[] = [
  {
    label: 'Funding Received',
    value: currencyINR(200000),
    detail: 'CIBA pre-seed grant loaded',
    icon: 'wallet',
    tone: 'teal',
    progress: 100,
  },
  {
    label: 'Funding Utilized',
    value: currencyINR(118400),
    detail: `${utilizationPercentage}% of total capital`,
    icon: 'receipt-indian-rupee',
    tone: 'amber',
    progress: utilizationPercentage,
  },
  {
    label: 'Available Cash',
    value: currencyINR(availableCash),
    detail: 'After paid commitments',
    icon: 'banknote',
    tone: 'emerald',
    progress: 40.8,
  },
  {
    label: 'Monthly Burn Rate',
    value: currencyINR(monthlyBurn),
    detail: 'Recurring + team commitments',
    icon: 'repeat-2',
    tone: 'rose',
    progress: 48,
  },
  {
    label: 'Runway Remaining',
    value: `${runwayMonths} months`,
    detail: 'At the current spending rate',
    icon: 'clock-3',
    tone: 'sky',
    progress: 84,
  },
  {
    label: 'Active Team Members',
    value: '5',
    detail: 'Founder, interns, advisors',
    icon: 'users',
    tone: 'slate',
    progress: 62,
  },
  {
    label: 'Pending Payments',
    value: currencyINR(22800),
    detail: '3 payments need review',
    icon: 'calendar-clock',
    tone: 'amber',
    progress: 29,
  },
  {
    label: 'Upcoming Expenses',
    value: currencyINR(14500),
    detail: 'Due in the next 14 days',
    icon: 'alert-circle',
    tone: 'rose',
    progress: 18,
  },
];

export const kpiMetrics: KpiMetric[] = [
  {
    label: 'Total Paid',
    value: currencyINR(95500),
    detail: 'Cleared from founder ledger',
    icon: 'check-circle-2',
    tone: 'emerald',
    change: '+12.4%',
    direction: 'up',
  },
  {
    label: 'Total Pending',
    value: currencyINR(22800),
    detail: 'Awaiting approvals',
    icon: 'calendar-clock',
    tone: 'amber',
    change: '-6.1%',
    direction: 'down',
  },
  {
    label: 'Compliance Buffer',
    value: currencyINR(18500),
    detail: 'Reserved for legal runway',
    icon: 'shield-check',
    tone: 'sky',
    change: 'Stable',
    direction: 'flat',
  },
  {
    label: 'Priority Spend',
    value: '71%',
    detail: 'Product + market validation',
    icon: 'target',
    tone: 'teal',
    change: '+4.8%',
    direction: 'up',
  },
];

export const categorySpends: CategorySpend[] = [
  { label: 'Legal & Compliance', amount: 50000, budget: 50000, icon: 'building-2', tone: 'sky' },
  { label: 'Product Development', amount: 42000, budget: 50000, icon: 'rocket', tone: 'teal' },
  { label: 'Market Validation', amount: 28000, budget: 40000, icon: 'trending-up', tone: 'emerald' },
  { label: 'AI Tools & Infra', amount: 15400, budget: 20000, icon: 'circle-gauge', tone: 'amber' },
  { label: 'Support Interns', amount: 18000, budget: 20000, icon: 'users', tone: 'slate' },
  { label: 'Branding Assets', amount: 7000, budget: 10000, icon: 'layers-3', tone: 'rose' },
];

export const ledgerPayments: LedgerPayment[] = [
  {
    title: 'Firebase / Google Cloud placeholder',
    owner: 'Infrastructure',
    category: 'Recurring Costs',
    status: 'Pending',
    amount: 1000,
    due: 'Jun 05',
  },
  {
    title: 'Founder legal agreement',
    owner: 'Compliance partner',
    category: 'Legal & Compliance',
    status: 'Partially Paid',
    amount: 22500,
    due: 'Jun 08',
  },
  {
    title: 'Product QA intern stipend',
    owner: 'Aarav Mehta',
    category: 'Team Payments',
    status: 'Paid',
    amount: 10000,
    due: 'Jun 10',
  },
  {
    title: 'Codex plan',
    owner: 'AI Development',
    category: 'AI Tools',
    status: 'Paid',
    amount: 2000,
    due: 'Jun 12',
  },
  {
    title: 'Trademark search',
    owner: 'Legal vendor',
    category: 'Startup Costs',
    status: 'Pending',
    amount: 6500,
    due: 'Jun 18',
  },
];

export const insightBars: InsightBar[] = [
  { label: 'Product', value: 84, amount: 42000, tone: 'teal' },
  { label: 'Compliance', value: 100, amount: 50000, tone: 'sky' },
  { label: 'Acquisition', value: 70, amount: 28000, tone: 'emerald' },
  { label: 'Infrastructure', value: 77, amount: 15400, tone: 'amber' },
];

export const burnTrend = [34, 42, 46, 58, 63, 52, 68, 74, 61, 70, 78, 66];

export const decisionNotes: DecisionNote[] = [
  {
    title: 'Prioritize legal cleanup before campaign spend',
    priority: 'High',
    date: 'Jun 01',
    outcome: 'Protects runway before scaling experiments',
  },
  {
    title: 'Cap AI subscriptions at fixed monthly budget',
    priority: 'Medium',
    date: 'May 29',
    outcome: 'Keeps tooling useful without silent burn creep',
  },
  {
    title: 'Release small acquisition tests in two channels',
    priority: 'Medium',
    date: 'May 24',
    outcome: 'Compares CAC early with limited downside',
  },
];

export const featurePages: Record<string, FeaturePageConfig> = {
  funding: {
    eyebrow: 'Funding Manager',
    title: 'Track every source of startup capital',
    description: 'Record grants, pre-seed checks, founder contributions, revenue, and notes against the funding source.',
    icon: 'wallet',
    primaryAction: 'Add Funding',
    secondaryAction: 'Export Sources',
    stats: [
      { label: 'Total Funding', value: currencyINR(200000), detail: '1 active grant', icon: 'banknote', tone: 'teal' },
      { label: 'Available Cash', value: currencyINR(availableCash), detail: 'After cleared payments', icon: 'wallet', tone: 'emerald' },
      { label: 'Utilized', value: `${utilizationPercentage}%`, detail: 'Capital deployed', icon: 'circle-gauge', tone: 'amber' },
    ],
    rows: [
      { title: 'CIBA Pre-seed Funding', meta: 'Grant · Received Jun 2026', status: 'Active', amount: currencyINR(200000) },
      { title: 'Founder contribution placeholder', meta: 'Personal · Draft', status: 'Draft', amount: currencyINR(0) },
    ],
  },
  expenses: {
    eyebrow: 'Expense Manager',
    title: 'Control paid, pending, and recurring expenses',
    description: 'Classify every expense by priority, category, due date, paid amount, and founder decision note.',
    icon: 'receipt-text',
    primaryAction: 'Add Expense',
    secondaryAction: 'Export CSV',
    stats: [
      { label: 'Total Expenses', value: currencyINR(118400), detail: 'Paid + pending', icon: 'receipt-indian-rupee', tone: 'amber' },
      { label: 'Pending', value: currencyINR(22800), detail: 'Needs review', icon: 'calendar-clock', tone: 'rose' },
      { label: 'Categories', value: '12', detail: 'Tracked spend groups', icon: 'layers-3', tone: 'sky' },
    ],
    rows: [
      { title: 'Founder legal agreement', meta: 'Legal & Compliance · Due Jun 08', status: 'Partially Paid', amount: currencyINR(22500) },
      { title: 'Codex plan', meta: 'AI Tools · Jun subscription', status: 'Paid', amount: currencyINR(2000) },
      { title: 'Trademark search', meta: 'Startup Costs · Due Jun 18', status: 'Pending', amount: currencyINR(6500) },
    ],
  },
  teamPayments: {
    eyebrow: 'Team Payment Tracker',
    title: 'Manage salaries, stipends, and contractors',
    description: 'Track monthly commitments across interns, freelancers, consultants, and early employees.',
    icon: 'users',
    primaryAction: 'Add Payment',
    secondaryAction: 'Month View',
    stats: [
      { label: 'Team Commitment', value: currencyINR(20000), detail: 'Monthly planned', icon: 'users', tone: 'teal' },
      { label: 'Paid', value: currencyINR(10000), detail: 'Cleared this month', icon: 'check-circle-2', tone: 'emerald' },
      { label: 'Pending', value: currencyINR(10000), detail: 'Remaining stipends', icon: 'clock-3', tone: 'amber' },
    ],
    rows: [
      { title: 'Product QA intern stipend', meta: 'Aarav Mehta · Intern · Jun', status: 'Paid', amount: currencyINR(10000) },
      { title: 'Growth intern stipend', meta: 'Pending approval · Jun', status: 'Pending', amount: currencyINR(10000) },
    ],
  },
  startupCosts: {
    eyebrow: 'One-Time Startup Costs',
    title: 'Track permanent company setup costs',
    description: 'Keep company registration, valuation, legal, trademark, domain, and compliance setup in one ledger.',
    icon: 'building-2',
    primaryAction: 'Add Cost',
    secondaryAction: 'Compliance View',
    stats: [
      { label: 'Setup Budget', value: currencyINR(50000), detail: 'Allocated capital', icon: 'building-2', tone: 'sky' },
      { label: 'Paid Setup', value: currencyINR(27500), detail: 'Cleared invoices', icon: 'check-circle-2', tone: 'emerald' },
      { label: 'Open Items', value: '4', detail: 'Compliance queue', icon: 'file-text', tone: 'amber' },
    ],
    rows: [
      { title: 'Company registration', meta: 'Compliance setup · Paid', status: 'Paid', amount: currencyINR(12000) },
      { title: 'Trademark search', meta: 'Legal vendor · Due Jun 18', status: 'Pending', amount: currencyINR(6500) },
      { title: 'Valuation support', meta: 'Founder documentation', status: 'Partially Paid', amount: currencyINR(9000) },
    ],
  },
  recurringCosts: {
    eyebrow: 'Recurring Cost Tracker',
    title: 'Understand monthly burn before it compounds',
    description: 'Monitor subscriptions, cloud, hosting, internet, and compliance retainers with next-month projections.',
    icon: 'repeat-2',
    primaryAction: 'Add Recurring',
    secondaryAction: 'Yearly Estimate',
    stats: [
      { label: 'Monthly Recurring', value: currencyINR(6000), detail: 'Baseline subscriptions', icon: 'repeat-2', tone: 'rose' },
      { label: 'Projected Yearly', value: currencyINR(72000), detail: 'At current plan', icon: 'line-chart', tone: 'sky' },
      { label: 'Next Renewal', value: 'Jun 05', detail: 'Firebase placeholder', icon: 'calendar-clock', tone: 'amber' },
    ],
    rows: [
      { title: 'Codex plan', meta: 'AI Development Tools · Monthly', status: 'Paid', amount: currencyINR(2000) },
      { title: 'Claude plan', meta: 'AI Development Tools · Monthly', status: 'Ready', amount: currencyINR(2000) },
      { title: 'Firebase / Google Cloud placeholder', meta: 'Infrastructure · Monthly', status: 'Pending', amount: currencyINR(1000) },
    ],
  },
  reports: {
    eyebrow: 'Reports & Insights',
    title: 'Spot burn risk and spending concentration',
    description: 'Review category spend, paid versus pending split, one-time versus recurring costs, and runway trend.',
    icon: 'bar-chart-3',
    primaryAction: 'Generate Report',
    secondaryAction: 'Export PDF',
    stats: [
      { label: 'Runway', value: `${runwayMonths} months`, detail: 'Current estimate', icon: 'clock-3', tone: 'sky' },
      { label: 'Priority Spend', value: '71%', detail: 'Product + validation', icon: 'target', tone: 'teal' },
      { label: 'Top Category', value: 'Legal', detail: currencyINR(50000), icon: 'building-2', tone: 'amber' },
    ],
    rows: [
      { title: 'Funding utilization report', meta: 'Capital allocated across six categories', status: 'Ready', amount: `${utilizationPercentage}%` },
      { title: 'Monthly burn trend', meta: 'Recurring + team commitments', status: 'Ready', amount: currencyINR(monthlyBurn) },
    ],
  },
  founderNotes: {
    eyebrow: 'Founder Notes',
    title: 'Keep decision quality close to spending',
    description: 'Record why an expense was made, expected benefit, priority, ROI expectation, and follow-up notes.',
    icon: 'notebook-text',
    primaryAction: 'Add Note',
    secondaryAction: 'Review Decisions',
    stats: [
      { label: 'Decision Notes', value: '3', detail: 'This month', icon: 'notebook-text', tone: 'teal' },
      { label: 'High Priority', value: '1', detail: 'Needs review', icon: 'alert-circle', tone: 'rose' },
      { label: 'ROI Reviews', value: '2', detail: 'Upcoming', icon: 'target', tone: 'sky' },
    ],
    rows: decisionNotes.map((note) => ({
      title: note.title,
      meta: `${note.priority} priority · ${note.date}`,
      status: 'Active',
      amount: note.outcome,
    })),
  },
  settings: {
    eyebrow: 'Settings',
    title: 'Control profile, theme, demo data, and exports',
    description: 'Manage founder profile, import/export, demo data loading, and future Firebase storage preferences.',
    icon: 'settings',
    primaryAction: 'Load Demo Data',
    secondaryAction: 'Export JSON',
    stats: [
      { label: 'Theme', value: 'System', detail: 'Stored locally', icon: 'settings', tone: 'slate' },
      { label: 'Demo Data', value: 'Ready', detail: currencyINR(200000), icon: 'upload', tone: 'teal' },
      { label: 'Exports', value: 'JSON/CSV', detail: 'Founder ledger', icon: 'download', tone: 'sky' },
    ],
    rows: [
      { title: 'Load demo data', meta: 'Creates founder finance sample ledger', status: 'Ready', amount: currencyINR(200000) },
      { title: 'Reset all data', meta: 'Requires confirmation in Firebase implementation', status: 'Draft', amount: 'Protected' },
    ],
  },
};
