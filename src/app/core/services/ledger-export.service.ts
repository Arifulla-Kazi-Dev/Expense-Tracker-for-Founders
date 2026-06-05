import { Injectable, inject } from '@angular/core';

import { DashboardSummary } from '../models/dashboard-summary.model';
import { PermissionService } from './permission.service';

export type LedgerExportFormat = 'json' | 'csv';

export interface LedgerExportContext {
  companyName?: string | null;
  exportedBy?: string | null;
  email?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LedgerExportService {
  private readonly permissionService = inject(PermissionService);

  canExport(): boolean {
    return this.permissionService.can('exportReports');
  }

  exportSummary(summary: DashboardSummary, format: LedgerExportFormat, context: LedgerExportContext = {}): void {
    if (!this.canExport()) {
      throw new Error('You do not have export permission for this workspace.');
    }

    const exportedAt = new Date();
    const companyName = context.companyName || 'company-workspace';
    const payload = {
      exportedAt: exportedAt.toISOString(),
      companyName,
      exportedBy: context.exportedBy ?? null,
      email: context.email ?? null,
      totals: {
        totalFunding: summary.totalFunding,
        totalExpenses: summary.totalExpenses,
        totalPaid: summary.totalPaid,
        totalPending: summary.totalPending,
        remainingBalance: summary.remainingBalance,
        monthlyBurn: summary.monthlyBurn,
        estimatedRunway: summary.estimatedRunway,
        utilizationPercentage: summary.utilizationPercentage,
      },
      metrics: summary.founderMetrics,
      fundingUtilization: summary.fundingUtilization,
      categorySpends: summary.categorySpends,
      spendSources: summary.spendSources,
      monthlySpendTrend: summary.monthlySpendTrend,
      ledgerPayments: summary.ledgerPayments,
      decisionNotes: summary.decisionNotes,
    };

    const extension = format === 'json' ? 'json' : 'csv';
    const content = format === 'json'
      ? JSON.stringify(payload, null, 2)
      : this.toCsv(payload);
    const mimeType = format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
    const filename = `${this.safeFilename(companyName)}-ledger-export-${this.dateStamp(exportedAt)}.${extension}`;

    this.download(filename, content, mimeType);
  }

  private toCsv(payload: Record<string, unknown>): string {
    const rows: Array<Array<string | number | null | undefined>> = [
      ['section', 'label', 'value', 'detail', 'extra'],
      ['export', 'company', payload['companyName'] as string, 'Exported company', payload['exportedAt'] as string],
    ];
    const totals = payload['totals'] as Record<string, number>;

    Object.entries(totals).forEach(([label, value]) => {
      rows.push(['totals', label, value, '', '']);
    });

    this.addRows(rows, 'metrics', payload['metrics'] as Array<Record<string, unknown>>, (item) => [
      item['label'] as string,
      item['value'] as string,
      item['detail'] as string,
      item['tone'] as string,
    ]);
    this.addRows(rows, 'fundingUtilization', payload['fundingUtilization'] as Array<Record<string, unknown>>, (item) => [
      item['sourceName'] as string,
      item['remaining'] as number,
      `received ${item['received']}, utilized ${item['utilized']}`,
      `${item['utilizationPercentage']}%`,
    ]);
    this.addRows(rows, 'categorySpends', payload['categorySpends'] as Array<Record<string, unknown>>, (item) => [
      item['label'] as string,
      item['amount'] as number,
      'Category spend',
      item['tone'] as string,
    ]);
    this.addRows(rows, 'monthlySpendTrend', payload['monthlySpendTrend'] as Array<Record<string, unknown>>, (item) => [
      item['month'] as string,
      item['amount'] as number,
      'Monthly outflow',
      '',
    ]);
    this.addRows(rows, 'ledgerPayments', payload['ledgerPayments'] as Array<Record<string, unknown>>, (item) => [
      item['title'] as string,
      item['amount'] as number,
      `${item['status']} - ${item['category']}`,
      item['due'] as string,
    ]);
    this.addRows(rows, 'decisionNotes', payload['decisionNotes'] as Array<Record<string, unknown>>, (item) => [
      item['title'] as string,
      item['priority'] as string,
      item['outcome'] as string,
      item['date'] as string,
    ]);

    return rows.map((row) => row.map((cell) => this.escapeCsv(cell)).join(',')).join('\n');
  }

  private addRows(
    rows: Array<Array<string | number | null | undefined>>,
    section: string,
    items: Array<Record<string, unknown>>,
    mapItem: (item: Record<string, unknown>) => Array<string | number | null | undefined>,
  ): void {
    items.forEach((item) => {
      rows.push([section, ...mapItem(item)]);
    });
  }

  private escapeCsv(value: string | number | null | undefined): string {
    const text = String(value ?? '');

    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  private download(filename: string, content: string, mimeType: string): void {
    const documentRef = globalThis.document;

    if (!documentRef) {
      throw new Error('Exports are available in the browser only.');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = documentRef.createElement('a');

    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private dateStamp(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private safeFilename(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'company-workspace';
  }
}
