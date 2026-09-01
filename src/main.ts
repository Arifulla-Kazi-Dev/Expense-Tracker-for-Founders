import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { bootstrapApplication, provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

const wasServerRendered = typeof document !== 'undefined' && !!document.getElementById('ng-state');

const bootstrapConfig: ApplicationConfig = wasServerRendered
  ? mergeApplicationConfig(appConfig, { providers: [provideClientHydration(withEventReplay())] })
  : appConfig;

bootstrapApplication(AppComponent, bootstrapConfig)
  .catch((err) => console.error(err));
