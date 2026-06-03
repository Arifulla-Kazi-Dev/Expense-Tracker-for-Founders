import { FeatureFormOption } from '../models/dashboard.models';
import { Funding, FundingSourceAttribution, FundingType } from '../models/funding.model';
import { currencyINR } from './finance-formatters';

export function fundingSourceOptions(records: Funding[]): FeatureFormOption[] {
  return [
    {
      value: '',
      label: 'Unassigned source',
      detail: 'Use when the spend source is not decided yet',
      icon: 'more-horizontal',
      tone: 'slate',
    },
    ...records.map((record) => ({
      value: record.id,
      label: record.sourceName,
      detail: `${record.type} / ${currencyINR(record.amount)}`,
      icon: fundingTypeIcon(record.type),
      tone: fundingTypeTone(record.type),
    })),
  ];
}

export function fundingTypeOptions(types: readonly FundingType[]): FeatureFormOption[] {
  return types.map((type) => ({
    value: type,
    label: type,
    detail: fundingTypeDetail(type),
    icon: fundingTypeIcon(type),
    tone: fundingTypeTone(type),
  }));
}

export function fundingAttribution(records: Funding[], sourceId: string): FundingSourceAttribution {
  const source = records.find((record) => record.id === sourceId);

  if (!source) {
    return {
      fundingSourceId: '',
      fundingSourceName: '',
      fundingSourceType: '',
    };
  }

  return {
    fundingSourceId: source.id,
    fundingSourceName: source.sourceName,
    fundingSourceType: source.type,
  };
}

export function fundingSourceLabel(record: FundingSourceAttribution): string {
  if (!record.fundingSourceName) {
    return 'Funding source not assigned';
  }

  return `${record.fundingSourceName}${record.fundingSourceType ? ` / ${record.fundingSourceType}` : ''}`;
}

function fundingTypeIcon(type: string): string {
  const value = type.toLowerCase();

  if (value.includes('grant')) {
    return 'badge-indian-rupee';
  }

  if (value.includes('pre') || value.includes('seed') || value.includes('venture') || value.includes('angel')) {
    return 'rocket';
  }

  if (value.includes('loan') || value.includes('bank') || value.includes('credit')) {
    return 'landmark';
  }

  if (value.includes('personal') || value.includes('friends')) {
    return 'users';
  }

  if (value.includes('revenue') || value.includes('customer')) {
    return 'receipt-indian-rupee';
  }

  if (value.includes('accelerator') || value.includes('crowd')) {
    return 'sparkles';
  }

  return 'wallet';
}

function fundingTypeTone(type: string): FeatureFormOption['tone'] {
  const value = type.toLowerCase();

  if (value.includes('grant') || value.includes('revenue') || value.includes('customer')) {
    return 'emerald';
  }

  if (value.includes('loan') || value.includes('bank') || value.includes('credit')) {
    return 'amber';
  }

  if (value.includes('personal') || value.includes('friends')) {
    return 'sky';
  }

  if (value.includes('venture') || value.includes('angel') || value.includes('seed')) {
    return 'teal';
  }

  return 'slate';
}

function fundingTypeDetail(type: string): string {
  const value = type.toLowerCase();

  if (value.includes('grant')) {
    return 'Non-dilutive program capital';
  }

  if (value.includes('pre') || value.includes('seed') || value.includes('venture') || value.includes('angel')) {
    return 'Investor-backed capital';
  }

  if (value.includes('loan') || value.includes('bank') || value.includes('credit')) {
    return 'Debt or credit line';
  }

  if (value.includes('personal') || value.includes('friends')) {
    return 'Owner or close-network capital';
  }

  if (value.includes('revenue') || value.includes('customer')) {
    return 'Customer-funded operating cash';
  }

  if (value.includes('accelerator') || value.includes('crowd')) {
    return 'Program or community-backed capital';
  }

  return 'Custom funding source';
}
