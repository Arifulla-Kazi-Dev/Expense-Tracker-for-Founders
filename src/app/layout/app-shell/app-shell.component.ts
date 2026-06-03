import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { mobileNavigationItems, navigationItems } from '../../core/data/navigation.data';
import { NavigationItem } from '../../core/models/dashboard.models';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [FormsModule, LucideDynamicIcon, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent implements OnInit, OnDestroy {
  readonly title = 'Startup Expense OS';
  readonly navigationItems = navigationItems;
  readonly mobileNavigationItems = mobileNavigationItems;
  readonly currentDateLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());

  globalSearch = '';
  isDarkMode = false;
  isMobileMenuOpen = false;
  isRetryingProfileSync = false;
  isSyncing = false;
  toastMessage = '';

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly permissionService = inject(PermissionService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly profileSyncError = toSignal(this.authService.profileSyncError$, { initialValue: '' });
  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  private toastTimer?: ReturnType<typeof setTimeout>;
  private syncTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }

    const savedTheme = localStorage.getItem('expense-tracker-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.isDarkMode = savedTheme ? savedTheme === 'dark' : prefersDark;
    this.applyTheme();
  }

  ngOnDestroy(): void {
    this.clearTimer(this.toastTimer);
    this.clearTimer(this.syncTimer);
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.applyTheme();
    this.showToast(`${this.isDarkMode ? 'Dark' : 'Light'} mode enabled`);
  }

  visibleNavigationItems(): NavigationItem[] {
    return navigationItems.filter((item) => this.canAccessNavigationItem(item));
  }

  visibleMobileNavigationItems(): NavigationItem[] {
    return mobileNavigationItems.filter((item) => this.canAccessNavigationItem(item));
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }

  simulateSync(): void {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    this.showToast('Syncing dashboard metrics');
    this.syncTimer = setTimeout(() => {
      this.isSyncing = false;
      this.showToast('Dashboard metrics refreshed');
    }, 900);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
  }

  dismissProfileSyncError(): void {
    this.authService.clearProfileSyncError();
  }

  async retryProfileSync(): Promise<void> {
    if (this.isRetryingProfileSync) {
      return;
    }

    this.isRetryingProfileSync = true;

    try {
      await this.authService.retryCurrentUserProfileSync();
      this.showToast('Profile synced to Firestore');
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Unable to sync profile');
    } finally {
      this.isRetryingProfileSync = false;
    }
  }

  initials(): string {
    const name = this.profile()?.name ?? 'Member';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'F';
  }

  roleLabel(): string {
    return this.permissionService.roleLabel();
  }

  runwayLabel(): string {
    return this.summary().runwayLabel;
  }

  runwayProgress(): number {
    return this.summary().runwayProgress;
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.clearTimer(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2200);
  }

  private applyTheme(): void {
    if (!this.isBrowser) {
      return;
    }

    this.document.documentElement.classList.toggle('dark', this.isDarkMode);
    localStorage.setItem('expense-tracker-theme', this.isDarkMode ? 'dark' : 'light');
  }

  private canAccessNavigationItem(item: NavigationItem): boolean {
    return !item.permission || this.permissionService.can(item.permission);
  }

  private clearTimer(timer?: ReturnType<typeof setTimeout>): void {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
