import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { mobileNavigationItems, navigationItems } from '../../core/data/navigation.data';
import { NavigationItem } from '../../core/models/dashboard.models';
import { CompanyMembership } from '../../core/models/company.model';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService, emptyDashboardSummary } from '../../core/services/dashboard.service';
import { PermissionService } from '../../core/services/permission.service';
import { currencyINR } from '../../core/utils/finance-formatters';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, RouterLink, RouterLinkActive, RouterOutlet],
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
  isCompanySwitcherOpen = false;
  isMobileMenuOpen = false;
  isRetryingProfileSync = false;
  isLoggingOut = false;
  isSwitchingCompany = false;
  isSyncing = false;
  toastMessage = '';

  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly permissionService = inject(PermissionService);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  readonly profile = toSignal(this.authService.profile$, { initialValue: null });
  readonly user = toSignal(this.authService.user$, { initialValue: this.authService.currentUser });
  readonly summary = toSignal(this.dashboardService.summary$, { initialValue: emptyDashboardSummary });
  readonly profileSyncError = toSignal(this.authService.profileSyncError$, { initialValue: '' });
  readonly memberships = toSignal(this.permissionService.memberships$, { initialValue: [] as CompanyMembership[] });
  readonly activeCompanyId = toSignal(this.permissionService.activeCompanyId$, { initialValue: null });
  readonly activeMembership = toSignal(this.permissionService.activeMembership$, { initialValue: null });
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

  get searchResults(): SearchResult[] {
    const query = this.globalSearch.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    const summary = this.summary();
    const results: SearchResult[] = [];
    const addResult = (result: SearchResult, searchableParts: Array<string | number | null | undefined>): void => {
      const searchable = searchableParts.join(' ').toLowerCase();

      if (searchable.includes(query)) {
        results.push(result);
      }
    };

    summary.fundingUtilization.forEach((source) => {
      addResult({
        title: source.sourceName,
        detail: `${source.type} funding - ${currencyINR(source.remaining)} left`,
        route: '/funding',
        icon: source.icon,
        type: 'Funding',
      }, [source.sourceName, source.type, source.received, source.remaining, source.utilized]);
    });

    const paymentRecords = summary.allLedgerPayments.length ? summary.allLedgerPayments : summary.ledgerPayments;

    paymentRecords.forEach((payment) => {
      addResult({
        title: payment.title,
        detail: `${payment.status} - ${currencyINR(payment.amount)} - ${payment.due}`,
        route: this.paymentRoute(payment.category),
        icon: this.paymentIcon(payment.category),
        type: 'Payment',
      }, [payment.title, payment.owner, payment.category, payment.status, payment.amount, payment.due]);
    });

    summary.categorySpends.forEach((category) => {
      addResult({
        title: category.label,
        detail: `${currencyINR(category.amount)} category spend`,
        route: '/reports',
        icon: category.icon,
        type: 'Category',
      }, [category.label, category.amount]);
    });

    summary.monthlySpendTrend.forEach((point) => {
      if (point.amount <= 0) {
        return;
      }

      addResult({
        title: point.month,
        detail: `${currencyINR(point.amount)} monthly outflow`,
        route: '/reports',
        icon: 'line-chart',
        type: 'Trend',
      }, [point.month, point.amount]);
    });

    summary.decisionNotes.forEach((note) => {
      addResult({
        title: note.title,
        detail: `${note.priority} priority - ${note.date}`,
        route: '/founder-notes',
        icon: 'notebook-text',
        type: 'Note',
      }, [note.title, note.priority, note.outcome, note.date]);
    });

    return results.slice(0, 8);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
    this.closeCompanySwitcher();
  }

  toggleCompanySwitcher(): void {
    if (!this.hasMultipleCompanies() || this.isSwitchingCompany) {
      return;
    }

    this.isCompanySwitcherOpen = !this.isCompanySwitcherOpen;
  }

  closeCompanySwitcher(): void {
    this.isCompanySwitcherOpen = false;
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
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this.closeMobileMenu();
    this.closeCompanySwitcher();

    try {
      await this.authService.logout();
    } finally {
      this.isLoggingOut = false;
    }
  }

  async selectActiveCompany(companyId: string): Promise<void> {
    if (!companyId || companyId === this.activeCompanyId() || this.isSwitchingCompany) {
      this.closeCompanySwitcher();
      return;
    }

    this.isSwitchingCompany = true;
    const nextCompanyName = this.memberships().find((membership) => membership.companyId === companyId)?.companyName ?? 'selected company';

    try {
      await this.permissionService.setActiveCompany(companyId);
      this.closeMobileMenu();
      this.closeCompanySwitcher();
      this.showToast(`Switched to ${nextCompanyName}`);
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : 'Unable to switch company');
    } finally {
      this.isSwitchingCompany = false;
    }
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
      this.showToast('Profile synced to Cloud');
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

  roleLabelFor(role: CompanyMembership['role'] | null | undefined): string {
    return this.permissionService.roleLabelFor(role);
  }

  hasMultipleCompanies(): boolean {
    return this.memberships().length > 1;
  }

  activeCompanyName(): string {
    return this.activeMembership()?.companyName || this.profile()?.companyName || 'Company workspace';
  }

  activeCompanyRoleLabel(): string {
    return this.roleLabelFor(this.activeMembership()?.role ?? this.profile()?.role ?? null);
  }

  companyInitials(companyName: string): string {
    return companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CO';
  }

  isActiveCompany(companyId: string): boolean {
    return companyId === this.activeCompanyId();
  }

  workspaceAccessLabel(): string {
    return this.hasMultipleCompanies() ? `${this.memberships().length} workspaces` : 'Active';
  }

  showToast(message: string): void {
    this.toastMessage = message;
    this.clearTimer(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 2200);
  }

  clearGlobalSearch(): void {
    this.globalSearch = '';
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

  private paymentRoute(category: string): string {
    const normalized = category.toLowerCase();

    if (['intern', 'employee', 'freelancer', 'consultant'].some((value) => normalized.includes(value))) {
      return '/team-payments';
    }

    if (normalized.includes('one-time')) {
      return '/startup-costs';
    }

    if (['monthly', 'quarterly', 'yearly'].some((value) => normalized.includes(value))) {
      return '/recurring-costs';
    }

    return '/expenses';
  }

  private paymentIcon(category: string): string {
    const route = this.paymentRoute(category);

    if (route === '/team-payments') {
      return 'users';
    }

    if (route === '/startup-costs') {
      return 'building-2';
    }

    if (route === '/recurring-costs') {
      return 'repeat-2';
    }

    return 'receipt-text';
  }

  private clearTimer(timer?: ReturnType<typeof setTimeout>): void {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

interface SearchResult {
  title: string;
  detail: string;
  route: string;
  icon: string;
  type: string;
}
