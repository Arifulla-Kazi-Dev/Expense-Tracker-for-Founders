import type { FeatureFormValue } from '../../shared/components/feature-page/feature-page.component';

export function textValue(value: Record<string, FeatureFormValue>, key: string): string {
  const fieldValue = value[key];
  return typeof fieldValue === 'string' ? fieldValue : String(fieldValue ?? '');
}

export function numberValue(value: Record<string, FeatureFormValue>, key: string): number {
  const fieldValue = value[key];
  const numericValue = Number(fieldValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function booleanValue(value: Record<string, FeatureFormValue>, key: string): boolean {
  return Boolean(value[key]);
}
