import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { User, UserId } from '../user';
import { JsonUser, JsonUserUpdate, UserMapper } from './mapper';
import { APIRepository } from '../repository';
import { AuthService } from '../auth/auth.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class UserRepository extends APIRepository {
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private mapper = inject(UserMapper);

  constructor() {
    super(inject(Router));
  }

  getUrl(id: number): string {
    return super.getApiUrl() + 'users/' + id;
  }

  getLoggedInObject(): Observable<User | undefined> {
    const loggedInUserId = this.authService.getLoggedInUserId();
    if (loggedInUserId === undefined) {
      return of(undefined);
    }
    return this.getObject(loggedInUserId);
  }

  protected getObject(userId: UserId): Observable<User> {
    return this.http.get<JsonUser>(this.getUrl(userId.getId()), this.getOptions()).pipe(
      map((jsonUser: JsonUser) => this.mapper.toObject(jsonUser)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  editObject(id: number, json: JsonUserUpdate): Observable<User> {
    return this.http.put<JsonUser>(this.getUrl(id), json, this.getOptions()).pipe(
      map((jsonUser: JsonUser) => this.mapper.toObject(jsonUser)),
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }

  removeObject(id: number): Observable<void> {
    return this.http.delete<void>(this.getUrl(id), this.getOptions()).pipe(
      catchError((err: HttpErrorResponse) => this.handleError(err))
    );
  }
}
