import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, signal, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { APIRepository } from '../repository';
import { UserId } from '../user';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService extends APIRepository {
  private http = inject(HttpClient);

  private authItem: JsonAuthItem | undefined;
  private readonly authItemSignal = signal<JsonAuthItem | undefined>(undefined);
  public readonly loggedIn = computed((): boolean => this.authItemSignal() !== undefined);

  constructor() {
    super(inject(Router));
    const authStorageItem = localStorage.getItem('auth');
    const authItem = authStorageItem ? JSON.parse(authStorageItem) : undefined;
    authItem ? this.setAuthItem(authItem) : this.clearAuthItem();
  }

  isLoggedIn(): boolean {
    return this.loggedIn();
  }

  getLoggedInUserId(): UserId | undefined {
    return this.authItem ? new UserId(this.authItem.userId) : undefined;
  }

  getToken(): string | undefined {
    return this.authItem?.token;
  }

  protected clearAuthItem() {
    this.authItem = undefined;
    this.authItemSignal.set(undefined);
    localStorage.removeItem('auth');
  }

  setAuthItem(authItem: JsonAuthItem): boolean {
    this.authItem = authItem;
    this.authItemSignal.set(authItem);
    localStorage.setItem('auth', JSON.stringify(authItem));
    return true;
  }

  getUrl(): string {
    return super.getApiUrl() + 'auth';
  }

  // register answers 201 without a body, so the new user is logged in afterwards
  register(newUser: { emailaddress: string, password: string }): Observable<boolean> {
    return this.http.post<void>(this.getUrl() + '/register', newUser, this.getOptions()).pipe(
      switchMap(() => this.login(newUser.emailaddress, newUser.password)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  extendToken() {
    this.http.post<JsonAuthItem>(this.getUrl() + '/extendtoken', undefined, this.getOptions()).pipe(
      map((authItem: JsonAuthItem) => this.setAuthItem(authItem)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    ).subscribe();
  }

  login(emailaddress: string, password: string): Observable<boolean> {
    const json = { emailaddress: emailaddress, password: password };
    return this.http.post<JsonAuthItem>(this.getUrl() + '/login', json, this.getOptions()).pipe(
      map((authItem: JsonAuthItem) => this.setAuthItem(authItem)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  // the API answers 200 whether or not the emailaddress is known
  passwordReset(email: string): Observable<void> {
    return this.http.post<void>(this.getUrl() + '/passwordreset', { emailaddress: email }, this.getOptions()).pipe(
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  // passwordchange answers 200 without a body, so the user is logged in afterwards
  passwordChange(emailaddress: string, password: string, token: string): Observable<boolean> {
    const json = { emailaddress: emailaddress, password: password, token: token };
    return this.http.post<void>(this.getUrl() + '/passwordchange', json, this.getOptions()).pipe(
      switchMap(() => this.login(emailaddress, password)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  validationRequest(): Observable<void> {
    return this.http.post<void>(this.getUrl() + '/validationrequest', undefined, this.getOptions()).pipe(
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  validate(code: string): Observable<void> {
    return this.http.post<void>(this.getUrl() + '/validate/' + encodeURIComponent(code), undefined, this.getOptions()).pipe(
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  logout(): void {
    this.clearAuthItem();
  }
}

interface JsonAuthItem {
  token: string;
  userId: number;
}
