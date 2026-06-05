import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { UserRole, roleDisplayName } from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { LedgerExportFormat, LedgerExportService } from '../../core/services/ledger-export.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, RouterLink],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly ledgerExportService = inject(LedgerExportService);

  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });

  noticeMessage = '';
  private noticeTimer?: ReturnType<typeof setTimeout>;

  roleLabel(role: UserRole | undefined): string {
    return roleDisplayName(role);
  }

  canExport(): boolean {
    return this.ledgerExportService.canExport();
  }

  exportLedger(format: LedgerExportFormat): void {
    try {
      this.ledgerExportService.exportSummary(this.summary(), format, {
        companyName: this.profile()?.companyName,
        exportedBy: this.profile()?.name,
        email: this.profile()?.email,
      });
      this.showNotice(`${format.toUpperCase()} export downloaded`);
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : 'Unable to export ledger');
    }
  }

  private showNotice(message: string): void {
    this.noticeMessage = message;

    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }

    this.noticeTimer = setTimeout(() => {
      this.noticeMessage = '';
    }, 2200);
  }

  ngOnDestroy(): void {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
    }
  }
}
