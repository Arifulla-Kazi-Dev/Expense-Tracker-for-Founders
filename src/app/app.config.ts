import { ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { FirebaseApp, provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { initializeFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { lucideIconProviders } from './core/icons/lucide-icons.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() =>
      initializeFirestore(
        inject(FirebaseApp),
        {
          experimentalForceLongPolling: true,
        },
        environment.firestoreDatabaseId,
      ),
    ),
    ...lucideIconProviders,
  ],
};
