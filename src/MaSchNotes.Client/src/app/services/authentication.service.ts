import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, catchError } from 'rxjs/operators';
import { User } from '../models/user.model';
import { LocalStorageService } from './local-storage.service';

export interface LoginResponse {
    isSuccess: boolean;
    token: string;
    encryptPass: string;
}

export interface CreateEncryptKeyResponse {
    encryptKey: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthenticationService {
    public get httpHeaders(): HttpHeaders {
        return new HttpHeaders({ 'Content-Type': 'application/json' }).set(
            'Authorization',
            'Bearer ' + this.localStorageService.token
        );
    }

    public get isLoggedIn(): boolean {
        return this.localStorageService.token !== null;
    }

    constructor(
        private httpClient: HttpClient,
        private localStorageService: LocalStorageService
    ) {}

    public checkTokenValid(): Observable<boolean> {
        const token = this.localStorageService.token;
        return token === null
            ? of(false)
            : this.httpClient
                  .get('api/auth/check', { headers: this.httpHeaders })
                  .pipe(
                      map(() => token),
                      catchError(() => {
                          this.localStorageService.token = null;
                          this.localStorageService.encryptPass = null;
                          return of(null);
                      })
                  );
    }

    public login(request: {
        username: string;
        password: string;
        stayLoggedIn: boolean;
    }): Observable<boolean> {
        return this.pipeLoginResponse(
            this.httpClient.post<LoginResponse>('api/auth/login', request)
        );
    }

    public register(request: {
        username: string;
        password: string;
        userInfo: User;
    }): Observable<boolean> {
        return this.pipeLoginResponse(
            this.httpClient.post<LoginResponse>('api/auth/register', request)
        );
    }

    public changePassword(request: {
        userId: number;
        oldPassword: string;
        newPassword: string;
    }): Observable<Object> {
        return this.httpClient.post('api/auth/changepassword', request, {
            headers: this.httpHeaders
        });
    }

    public logoff() {
        this.localStorageService.token = null;
        this.localStorageService.encryptPass = null;
    }

    public createEncryptKey(): Observable<string> {
        return this.httpClient
            .post<CreateEncryptKeyResponse>(
                'api/auth/encryptkey',
                { encryptPass: this.localStorageService.encryptPass },
                {
                    headers: this.httpHeaders
                }
            )
            .pipe(
                map((response: CreateEncryptKeyResponse) => response.encryptKey)
            );
    }

    private pipeLoginResponse(
        observable: Observable<LoginResponse>
    ): Observable<boolean> {
        return observable.pipe(
            map((response: LoginResponse) => {
                if (response.isSuccess) {
                    this.localStorageService.token = response.token;
                    this.localStorageService.encryptPass = response.encryptPass;
                }
                return response.isSuccess;
            }),
            catchError(() => {
                return of(false);
            })
        );
    }
}
