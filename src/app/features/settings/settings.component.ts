import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';

import { UserRole, roleDisplayName } from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, LucideDynamicIcon, RouterLink],
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnDestroy {
  private readonly authService = inject(AuthService);

  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  noticeMessage = '';
  private noticeTimer?: ReturnType<typeof setTimeout>;

  roleLabel(role: UserRole | undefined): string {
    return roleDisplayName(role);
  }

  prepareExport(format: 'CSV' | 'JSON'): void {
    this.noticeMessage = `${format} export prepared from live ledger records.`;

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
