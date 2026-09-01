import { Routes } from '@angular/router';

import { authChildGuard, authGuard, publicOnlyGuard } from './core/guards/auth.guard';
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
        path: 'follow-up',
        loadComponent: () =>
          import('./features/follow-up/follow-up.component').then((m) => m.FollowUpComponent),
      },
      {
        path: 'funding',
        loadComponent: () =>
          import('./features/funding/funding.component').then((m) => m.FundingComponent),
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('./features/expenses/expenses.component').then((m) => m.ExpensesComponent),
      },
      {
        path: 'team-payments',
        loadComponent: () =>
          import('./features/team-payments/team-payments.component').then((m) => m.TeamPaymentsComponent),
      },
      {
        path: 'startup-costs',
        loadComponent: () =>
          import('./features/startup-costs/startup-costs.component').then((m) => m.StartupCostsComponent),
      },
      {
        path: 'recurring-costs',
        loadComponent: () =>
          import('./features/recurring-costs/recurring-costs.component').then((m) => m.RecurringCostsComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'founder-notes',
        loadComponent: () =>
          import('./features/founder-notes/founder-notes.component').then((m) => m.FounderNotesComponent),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent),
      },
      {
        path: 'invites',
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
