import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((module) => module.HomeComponent),
  },
  {
    path: 'user',
    loadChildren: () => import('./user/user.routes').then((module) => module.userRoutes),
  },
  { path: '**', redirectTo: '' },
];
