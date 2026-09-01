import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'expense-tracker-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Reactive theme flag for templates/components. */
  readonly isDark = signal(false);

  private initialized = false;

  /** Read the saved/system preference and apply it. Safe to call multiple times. */
  init(): void {
    if (!this.isBrowser || this.initialized) {
      return;
    }

    this.initialized = true;
    this.isDark.set(this.resolveInitialPreference());
    this.apply();
  }

  toggle(): ThemeMode {
    this.isDark.set(!this.isDark());
    this.apply();
    this.persist();
    return this.isDark() ? 'dark' : 'light';
  }

  set(mode: ThemeMode): void {
    this.isDark.set(mode === 'dark');
    this.apply();
    this.persist();
  }

  private resolveInitialPreference(): boolean {
    const saved = this.readStored();

    if (saved === 'dark' || saved === 'light') {
      return saved === 'dark';
    }

    try {
      return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  }

  private apply(): void {
    if (!this.isBrowser) {
      return;
    }

    this.document.documentElement.classList.toggle('dark', this.isDark());
  }

  private persist(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, this.isDark() ? 'dark' : 'light');
    } catch {
      // Storage can be disabled in private or locked-down browsers.
    }
  }

  private readStored(): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}
