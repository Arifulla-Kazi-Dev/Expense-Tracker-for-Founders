import type { Permission } from './role.model';

export type Tone = 'teal' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
export type PaymentStatus = 'Paid' | 'Pending' | 'Partially Paid';
export type Direction = 'up' | 'down' | 'flat';

export interface NavigationItem {
  label: string;
  icon: string;
  route: string;
  permission?: Permission;
}

export interface FounderMetric {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: Tone;
  progress?: number;
}

export interface KpiMetric {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: Tone;
  change: string;
  direction: Direction;
}

export interface CategorySpend {
  label: string;
  amount: number;
  budget: number;
  icon: string;
  tone: Tone;
}

export interface LedgerPayment {
  id: string;
  title: string;
  owner: string;
  category: string;
  status: PaymentStatus;
  amount: number;
  due: string;
}

export interface InsightBar {
  label: string;
  value: number;
  amount: number;
  tone: Tone;
}

export interface MonthlyTrendPoint {
  month: string;
  amount: number;
  year?: number;
  monthIndex?: number;
  key?: string;
}

export interface SpendSource {
  label: string;
  amount: number;
  detail: string;
  icon: string;
  tone: Tone;
}

export interface FundingUtilization {
  sourceId: string;
  sourceName: string;
  type: string;
  received: number;
  utilized: number;
  remaining: number;
  utilizationPercentage: number;
  icon: string;
  tone: Tone;
}

export interface DecisionNote {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  date: string;
  outcome: string;
}

export interface FeaturePageStat {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: Tone;
}

export interface FeaturePageRow {
  id?: string;
  title: string;
  meta: string;
  status: PaymentStatus | 'Active' | 'Draft' | 'Ready' | 'Inactive';
  amount: string;
  raw?: Record<string, unknown>;
  /** When set, this row is shown read-only (no edit/delete) with this label instead — for records that actually live on and must be edited from a different page. */
  lockedLabel?: string;
  /** When set, shows a quick-action button (e.g. Pause/Resume) that emits (toggleRecord) instead of opening the edit form. */
  toggleAction?: {
    label: string;
    icon: string;
  };
}

export type FeatureFieldType = 'checkbox' | 'date' | 'month' | 'number' | 'select' | 'textarea' | 'text';

export interface FeatureFormOption {
  value: string;
  label: string;
  detail?: string;
  icon?: string;
  tone?: Tone;
}

export interface FeatureFormField {
  name: string;
  label: string;
  type: FeatureFieldType;
  options?: readonly (string | FeatureFormOption)[];
  placeholder?: string;
  required?: boolean;
  readonly?: boolean;
  display?: 'cards' | 'select';
  requiredWhen?: {
    field: string;
    value: string | number | boolean;
  };
  rows?: number;
  hint?: string;
}

export interface FeaturePageConfig {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  primaryAction: string;
  secondaryAction: string;
  stats: FeaturePageStat[];
  rows: FeaturePageRow[];
  emptyTitle?: string;
  emptyDescription?: string;
  fields?: FeatureFormField[];
  formTitle?: string;
}
