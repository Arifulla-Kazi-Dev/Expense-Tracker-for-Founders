import { ApplicationConfig, PLATFORM_ID, inject, provideZoneChangeDetection } from '@angular/core';
import { FirebaseApp, provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { lucideIconProviders } from './core/icons/lucide-icons.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => {
      const platformId = inject(PLATFORM_ID);

      return initializeFirestore(
        inject(FirebaseApp),
        {
          experimentalForceLongPolling: true,
          localCache: isPlatformBrowser(platformId)
            ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
            : memoryLocalCache(),
        },
        environment.firestoreDatabaseId,
      );
    }),
    ...lucideIconProviders,
  ],
};
