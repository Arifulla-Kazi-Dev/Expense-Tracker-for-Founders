export const inrFormatter = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});

export function currencyINR(value: number): string {
  return inrFormatter.format(value);
}
