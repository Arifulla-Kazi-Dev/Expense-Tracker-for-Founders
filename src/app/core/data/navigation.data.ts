import { NavigationItem } from '../models/dashboard.models';

export const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
  { label: 'Funding', icon: 'wallet', route: '/funding' },
  { label: 'Expenses', icon: 'receipt-text', route: '/expenses' },
  { label: 'Salaries', icon: 'users', route: '/team-payments' },
  { label: 'Startup Costs', icon: 'building-2', route: '/startup-costs' },
  { label: 'Recurring Costs', icon: 'repeat-2', route: '/recurring-costs' },
  { label: 'Reports', icon: 'bar-chart-3', route: '/reports' },
  { label: 'Founder Notes', icon: 'notebook-text', route: '/founder-notes' },
  { label: 'Profile', icon: 'user', route: '/profile' },
  { label: 'Settings', icon: 'settings', route: '/settings' },
];

export const mobileNavigationItems = navigationItems.filter((item) =>
  ['Dashboard', 'Expenses', 'Reports', 'Settings'].includes(item.label),
);
