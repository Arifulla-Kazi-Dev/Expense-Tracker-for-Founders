import { NavigationItem } from '../models/dashboard.models';

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
  { label: 'Funding', icon: 'wallet', route: '/funding', permission: 'manageFunding' },
  { label: 'Expenses', icon: 'receipt-text', route: '/expenses', permission: 'manageExpenses' },
  { label: 'Salaries', icon: 'users', route: '/team-payments', permission: 'manageTeamPayments' },
  { label: 'Startup Costs', icon: 'building-2', route: '/startup-costs', permission: 'manageStartupCosts' },
  { label: 'Recurring Costs', icon: 'repeat-2', route: '/recurring-costs', permission: 'manageRecurringCosts' },
  { label: 'Reports', icon: 'bar-chart-3', route: '/reports', permission: 'viewReports' },
  { label: 'Founder Notes', icon: 'notebook-text', route: '/founder-notes', permission: 'manageFounderNotes' },
  { label: 'Team', icon: 'users', route: '/team', permission: 'manageMembers' },
  { label: 'Profile', icon: 'user', route: '/profile' },
  { label: 'Settings', icon: 'settings', route: '/settings' },
];

export const mobileNavigationItems = navigationItems.filter((item) =>
  ['Dashboard', 'Expenses', 'Reports', 'Settings'].includes(item.label),
);
