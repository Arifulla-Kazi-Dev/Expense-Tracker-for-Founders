import { Routes } from '@angular/router';

import { authChildGuard, authGuard, permissionGuard, publicOnlyGuard } from './core/guards/auth.guard';
import { AppShellComponent } from './layout/app-shell/app-shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    canActivateChild: [authChildGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'funding',
        canActivate: [permissionGuard('manageFunding')],
        loadComponent: () =>
          import('./features/funding/funding.component').then((m) => m.FundingComponent),
      },
      {
        path: 'expenses',
        canActivate: [permissionGuard('manageExpenses')],
        loadComponent: () =>
          import('./features/expenses/expenses.component').then((m) => m.ExpensesComponent),
      },
      {
        path: 'team-payments',
        canActivate: [permissionGuard('manageTeamPayments')],
        loadComponent: () =>
          import('./features/team-payments/team-payments.component').then((m) => m.TeamPaymentsComponent),
      },
      {
        path: 'startup-costs',
        canActivate: [permissionGuard('manageStartupCosts')],
        loadComponent: () =>
          import('./features/startup-costs/startup-costs.component').then((m) => m.StartupCostsComponent),
      },
      {
        path: 'recurring-costs',
        canActivate: [permissionGuard('manageRecurringCosts')],
        loadComponent: () =>
          import('./features/recurring-costs/recurring-costs.component').then((m) => m.RecurringCostsComponent),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard('viewReports')],
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'founder-notes',
        canActivate: [permissionGuard('manageFounderNotes')],
        loadComponent: () =>
          import('./features/founder-notes/founder-notes.component').then((m) => m.FounderNotesComponent),
      },
      {
        path: 'team',
        canActivate: [permissionGuard('manageMembers')],
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'invites',
        canActivate: [permissionGuard('inviteMembers')],
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'settings/company',
        loadComponent: () =>
          import('./features/company-settings/company-settings.component').then((m) => m.CompanySettingsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
