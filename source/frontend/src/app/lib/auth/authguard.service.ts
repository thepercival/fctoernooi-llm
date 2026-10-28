import { Injectable, inject } from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';

import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthguardService  {
  private router = inject(Router);
  private authService = inject(AuthService);

  constructor() { }

  canActivate() {
    if (this.authService.isLoggedIn()) {
      // logged in so return true
      return true;
    }
    const navigationExtras: NavigationExtras = {
      queryParams: { type: 'warning', message: 'je bent niet ingelogd en teruggestuurd naar de homepagina' }
    };
    this.router.navigate(['/'], navigationExtras);
    return false;
  }

}
