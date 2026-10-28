import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// Adds the JWT to calls to the API and logs the user out when the API says the token is no longer valid.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiurl)) {
    return next(req);
  }
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const authReq = token ? req.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : req;
  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (token && err instanceof HttpErrorResponse && err.status === 401) {
        authService.logout();
        router.navigate([''], { queryParams: { type: 'warning', message: 'de sessie is verlopen, log opnieuw in' } });
      }
      return throwError(() => err);
    })
  );
};
