import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly title = 'Startup Expense OS';
  private readonly themeService = inject(ThemeService);

  constructor() {
    // Apply the saved/system theme app-wide (including auth pages) before the shell loads.
    this.themeService.init();
  }
}
