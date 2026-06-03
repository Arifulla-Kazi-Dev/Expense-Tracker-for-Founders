import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon],
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  @Input() title = 'Confirm action';
  @Input() message = 'This action needs your confirmation.';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() icon = 'alert-circle';
  @Input() tone: 'danger' | 'warning' | 'neutral' = 'neutral';
  @Input() isBusy = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  toneClass(): string {
    if (this.tone === 'danger') {
      return 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-400/10 dark:text-rose-200 dark:ring-rose-400/20';
    }

    if (this.tone === 'warning') {
      return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20';
    }

    return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  }

  confirmButtonClass(): string {
    if (this.tone === 'danger') {
      return 'bg-rose-600 text-white hover:bg-rose-700';
    }

    if (this.tone === 'warning') {
      return 'bg-amber-500 text-slate-950 hover:bg-amber-400';
    }

    return 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200';
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.isBusy) {
      this.cancel.emit();
    }
  }
}
