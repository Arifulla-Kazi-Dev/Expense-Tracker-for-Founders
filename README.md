# Expense Tracker for Founders

Founder-focused finance OS for tracking funding, expenses, salaries, startup costs, recurring costs, reports, and founder notes.

## Tech Stack

- Angular 19
- AngularFire + Firebase Auth + Cloud Firestore
- TailwindCSS 4
- Lucide Angular icons
- Angular CDK

## Local Development

```bash
npm install
npm run start
```

Open `http://localhost:4200/`.

## Production Build

```bash
npm run build
```

## GitHub Pages Build

```bash
npm run build:github
```

The GitHub Pages workflow publishes `dist/expense-tracker-founders/browser`, promotes Angular's `index.csr.html` browser shell to `index.html`, and copies it to `404.html` so Angular routes work on refresh.

Live URL after Pages deployment:

```text
https://arifulla-kazi-dev.github.io/Expense-Tracker-for-Founders/
```

## Firebase

The app expects Firebase Authentication and Cloud Firestore to be enabled. Firestore data is stored under:

```text
users/{uid}
users/{uid}/funding
users/{uid}/expenses
users/{uid}/teamPayments
users/{uid}/startupCosts
users/{uid}/recurringCosts
users/{uid}/founderNotes
```

Deploy Firestore rules with:

```bash
firebase deploy --only firestore:rules
```
