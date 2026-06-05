import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { FeaturePageConfig, FeaturePageRow } from '../../core/models/dashboard.models';
import { FOUNDER_NOTE_PRIORITIES, FounderNote, FounderNoteInput } from '../../core/models/founder-note.model';
import { FounderNoteService } from '../../core/services/founder-note.service';
import { PermissionService } from '../../core/services/permission.service';
import { textValue } from '../../core/utils/feature-form-values';
import { FeaturePageComponent, FeatureSaveEvent } from '../../shared/components/feature-page/feature-page.component';

@Component({
  selector: 'app-founder-notes',
  standalone: true,
  imports: [FeaturePageComponent],
  templateUrl: './founder-notes.component.html',
})
export class FounderNotesComponent implements OnDestroy {
  private readonly founderNoteService = inject(FounderNoteService);
  private readonly permissionService = inject(PermissionService);
  private readonly notes = toSignal(this.founderNoteService.list(), { initialValue: [] as FounderNote[] });
  private toastTimer?: ReturnType<typeof setTimeout>;

  errorMessage = '';
  isBusy = false;
  toastMessage = '';

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  get feature(): FeaturePageConfig {
    const records = this.notes();
    const highPriority = records.filter((item) => item.priority === 'High').length;

    return {
      eyebrow: 'Workspace Notes',
      title: 'Keep decision quality close to spending',
      description: 'Record why an expense was made, expected benefit, priority, ROI expectation, and follow-up notes.',
      icon: 'notebook-text',
      primaryAction: 'Add Note',
      secondaryAction: 'Realtime',
      formTitle: 'Add workspace note',
      emptyTitle: 'No decision notes yet',
      emptyDescription: 'Capture the reasoning behind important finance decisions and revisit ROI later.',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'relatedExpenseId', label: 'Related expense ID', type: 'text', placeholder: 'Optional cloud record ID' },
        { name: 'decisionReason', label: 'Decision reason', type: 'textarea', required: true, rows: 3 },
        { name: 'expectedBenefit', label: 'Expected benefit', type: 'textarea', required: true, rows: 3 },
        { name: 'priority', label: 'Priority', type: 'select', required: true, options: FOUNDER_NOTE_PRIORITIES },
        { name: 'roiExpectation', label: 'ROI expectation', type: 'text', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      ],
      stats: [
        { label: 'Decision Notes', value: String(records.length), detail: 'Workspace decisions logged', icon: 'notebook-text', tone: 'teal' },
        { label: 'High Priority', value: String(highPriority), detail: 'Needs close review', icon: 'alert-circle', tone: highPriority > 0 ? 'rose' : 'emerald' },
        { label: 'ROI Reviews', value: String(records.filter((item) => item.roiExpectation).length), detail: 'With ROI expectation', icon: 'target', tone: 'sky' },
      ],
      rows: [],
    };
  }

  get rows(): FeaturePageRow[] {
    return this.notes().map((item) => ({
      id: item.id,
      title: item.title,
      meta: `${item.priority} priority - ${item.date || 'Date not set'}`,
      status: 'Active',
      amount: item.expectedBenefit,
      raw: item as unknown as Record<string, unknown>,
    }));
  }

  async save(event: FeatureSaveEvent): Promise<void> {
    const relatedExpenseId = textValue(event.value, 'relatedExpenseId').trim();
    const payload: FounderNoteInput = {
      title: textValue(event.value, 'title'),
      relatedExpenseId: relatedExpenseId || undefined,
      decisionReason: textValue(event.value, 'decisionReason'),
      expectedBenefit: textValue(event.value, 'expectedBenefit'),
      priority: textValue(event.value, 'priority') as FounderNoteInput['priority'],
      roiExpectation: textValue(event.value, 'roiExpectation'),
      date: textValue(event.value, 'date'),
      notes: textValue(event.value, 'notes'),
    };

    await this.runMutation(
      () => event.id ? this.founderNoteService.update(event.id, payload) : this.founderNoteService.create(payload),
      event.id ? 'Workspace note updated' : 'Workspace note saved',
    );
  }

  async delete(id: string): Promise<void> {
    await this.runMutation(() => this.founderNoteService.delete(id), 'Workspace note deleted');
  }

  acknowledgeRealtime(): void {
    this.errorMessage = '';
    this.showToast('Live sync is active. Workspace notes update automatically.');
  }

  canEdit(): boolean {
    return this.permissionService.can('manageFounderNotes');
  }

  private async runMutation(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.isBusy = true;
    this.errorMessage = '';

    try {
      await action();
      this.showToast(successMessage);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save workspace note.';
    } finally {
      this.isBusy = false;
    }
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2400);
  }
}
