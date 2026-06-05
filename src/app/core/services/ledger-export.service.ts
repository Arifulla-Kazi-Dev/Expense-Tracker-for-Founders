import { Injectable, inject } from '@angular/core';

import { DashboardSummary } from '../models/dashboard-summary.model';
import { PermissionService } from './permission.service';

export type LedgerExportFormat = 'json' | 'csv' | 'pdf';

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
      ledgerPayments: summary.allLedgerPayments.length ? summary.allLedgerPayments : summary.ledgerPayments,
      decisionNotes: summary.decisionNotes,
    };

    const extension = format;
    const content = format === 'json'
      ? JSON.stringify(payload, null, 2)
      : format === 'csv'
        ? this.toCsv(payload)
        : this.toPdf(payload);
    const mimeType = format === 'json'
      ? 'application/json;charset=utf-8'
      : format === 'csv'
        ? 'text/csv;charset=utf-8'
        : 'application/pdf';
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

  private toPdf(payload: Record<string, unknown>): string {
    const totals = payload['totals'] as Record<string, number>;
    const metrics = payload['metrics'] as Array<Record<string, unknown>>;
    const fundingUtilization = payload['fundingUtilization'] as Array<Record<string, unknown>>;
    const categorySpends = payload['categorySpends'] as Array<Record<string, unknown>>;
    const monthlySpendTrend = payload['monthlySpendTrend'] as Array<Record<string, unknown>>;
    const ledgerPayments = payload['ledgerPayments'] as Array<Record<string, unknown>>;
    const decisionNotes = payload['decisionNotes'] as Array<Record<string, unknown>>;
    const report = new SimplePdfReport();

    report.title('Company Finance Report');
    report.text(`Company: ${payload['companyName'] ?? 'Company workspace'}`);
    report.text(`Exported: ${this.formatDate(payload['exportedAt'])}`);
    report.text(`Prepared by: ${payload['exportedBy'] ?? 'Workspace member'}${payload['email'] ? ` (${payload['email']})` : ''}`);
    report.spacer(12);

    report.section('Executive Summary');
    report.keyValue('Funding received', this.currency(totals['totalFunding']));
    report.keyValue('Funding utilized', this.currency(totals['totalPaid']));
    report.keyValue('Available cash', this.currency(totals['remainingBalance']));
    report.keyValue('Pending commitments', this.currency(totals['totalPending']));
    report.keyValue('Monthly burn', this.currency(totals['monthlyBurn']));
    report.keyValue('Runway', `${totals['estimatedRunway'] ?? 0} months`);
    report.text(`Funding utilization: ${totals['utilizationPercentage'] ?? 0}% of received capital has cleared as paid spend.`);
    report.spacer(8);

    report.section('Operating Metrics');
    metrics.forEach((item) => {
      report.keyValue(String(item['label'] ?? 'Metric'), `${item['value'] ?? ''} - ${item['detail'] ?? ''}`);
    });

    report.section('Funding Source Utilization');
    if (fundingUtilization.length) {
      fundingUtilization.forEach((item) => {
        report.text(`${item['sourceName'] ?? 'Funding source'} (${item['type'] ?? 'Type not set'})`);
        report.indented(`Received ${this.currency(Number(item['received'] ?? 0))}; utilized ${this.currency(Number(item['utilized'] ?? 0))}; remaining ${this.currency(Number(item['remaining'] ?? 0))}; utilization ${item['utilizationPercentage'] ?? 0}%.`);
      });
    } else {
      report.text('No funding source records are available.');
    }

    report.section('Category Concentration');
    if (categorySpends.length) {
      categorySpends.forEach((item) => {
        report.keyValue(String(item['label'] ?? 'Category'), this.currency(Number(item['amount'] ?? 0)));
      });
    } else {
      report.text('No category spend is available.');
    }

    report.section('Month-Year Cash Outflow');
    if (monthlySpendTrend.some((item) => Number(item['amount'] ?? 0) > 0)) {
      monthlySpendTrend.forEach((item) => {
        report.keyValue(String(item['month'] ?? 'Month'), this.currency(Number(item['amount'] ?? 0)));
      });
    } else {
      report.text('No dated monthly spend is available.');
    }

    report.section('Recent and Upcoming Payments');
    if (ledgerPayments.length) {
      ledgerPayments.forEach((item) => {
        report.text(`${item['title'] ?? 'Payment'} - ${this.currency(Number(item['amount'] ?? 0))}`);
        report.indented(`${item['status'] ?? 'Status'}; ${item['category'] ?? 'Category'}; due ${item['due'] ?? 'Not set'}; owner ${item['owner'] ?? 'Not set'}.`);
      });
    } else {
      report.text('No payment queue records are available.');
    }

    report.section('Decision Notes');
    if (decisionNotes.length) {
      decisionNotes.forEach((item) => {
        report.text(`${item['priority'] ?? 'Priority'} - ${item['title'] ?? 'Decision note'}`);
        report.indented(`${item['date'] ?? 'No date'}: ${item['outcome'] ?? ''}`);
      });
    } else {
      report.text('No workspace decision notes are available.');
    }

    report.section('How To Read This Report');
    report.text('Use funding utilization to see which capital sources are being consumed.');
    report.text('Use month-year cash outflow to separate historical spend from current-year spend.');
    report.text('Use category concentration to spot one-time setup spikes versus repeated burn pressure.');

    return report.output();
  }

  private download(filename: string, content: BlobPart, mimeType: string): void {
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

  private currency(value: number): string {
    return `INR ${Number.isFinite(value) ? Math.round(value).toLocaleString('en-IN') : 0}`;
  }

  private formatDate(value: unknown): string {
    const date = typeof value === 'string' ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return String(value ?? 'Not available');
    }

    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
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

class SimplePdfReport {
  private readonly pageWidth = 595;
  private readonly pageHeight = 842;
  private readonly margin = 44;
  private readonly pages: string[][] = [[]];
  private y = 790;

  title(value: string): void {
    this.write(value, 24, this.margin, 'F2', 30);
    this.rule();
  }

  section(value: string): void {
    this.spacer(8);
    this.ensureSpace(36);
    this.write(value, 14, this.margin, 'F2', 18);
    this.rule();
  }

  text(value: string): void {
    this.write(value, 10, this.margin, 'F1', 14);
  }

  indented(value: string): void {
    this.write(value, 9, this.margin + 18, 'F1', 13);
  }

  keyValue(label: string, value: string): void {
    this.write(`${label}: ${value}`, 10, this.margin, 'F1', 14);
  }

  spacer(amount: number): void {
    this.y -= amount;
  }

  output(): string {
    const objects: string[] = [];
    const pageIds: number[] = [];
    let nextObjectId = 5;

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

    this.pages.forEach((commands) => {
      const pageId = nextObjectId;
      const contentId = nextObjectId + 1;
      nextObjectId += 2;
      pageIds.push(pageId);

      const stream = commands.join('\n');
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (let index = 1; index < objects.length; index += 1) {
      offsets[index] = pdf.length;
      pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += '0000000000 65535 f \n';

    for (let index = 1; index < objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
  }

  private write(value: string, size: number, x: number, font: 'F1' | 'F2', leading: number): void {
    this.wrap(value, size, x).forEach((line) => {
      this.ensureSpace(leading + 2);
      this.command(`BT /${font} ${size} Tf ${x} ${this.y} Td (${escapePdfText(line)}) Tj ET`);
      this.y -= leading;
    });
  }

  private wrap(value: string, size: number, x: number): string[] {
    const text = sanitizePdfText(value);
    const maxChars = Math.max(Math.floor((this.pageWidth - this.margin - x) / (size * 0.5)), 18);
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';

    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;

      if (next.length <= maxChars) {
        current = next;
        return;
      }

      if (current) {
        lines.push(current);
      }

      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}-` : word;
    });

    if (current) {
      lines.push(current);
    }

    return lines.length ? lines : [''];
  }

  private rule(): void {
    this.ensureSpace(10);
    this.command(`0.85 0.88 0.92 RG ${this.margin} ${this.y} m ${this.pageWidth - this.margin} ${this.y} l S`);
    this.y -= 12;
  }

  private ensureSpace(height: number): void {
    if (this.y - height > this.margin) {
      return;
    }

    this.pages.push([]);
    this.y = 790;
  }

  private command(value: string): void {
    this.pages[this.pages.length - 1].push(value);
  }
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/₹/g, 'INR ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '');
}

function escapePdfText(value: string): string {
  return sanitizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
