import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser) {
    return true;
  }

  return authService.user$.pipe(
    take(1),
    map((user) => user ? true : router.createUrlTree(['/login'])),
  );
};

export const authChildGuard: CanActivateChildFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser) {
    return true;
  }

  return authService.user$.pipe(
    take(1),
    map((user) => user ? true : router.createUrlTree(['/login'])),
  );
};

export const publicOnlyGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser) {
    return router.createUrlTree(['/dashboard']);
  }

  return authService.user$.pipe(
    take(1),
    map((user) => user ? router.createUrlTree(['/dashboard']) : true),
  );
};
