import { Injectable } from '@angular/core';
import { AuthenticationService, LoginResponse } from './authentication.service';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';
import { map } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    constructor(
        private authService: AuthenticationService,
        private httpClient: HttpClient,
        private localStorageService: LocalStorageService
    ) {}

    getUserInfo(): Observable<User> {
        return this.httpClient
            .get('api/user', {
                headers: this.authService.httpHeaders
            })
            .pipe(map(x => User.fromJSON(x)));
    }

    updateUserInfo(newInfo: User): Observable<LoginResponse> {
        return this.httpClient
            .post<LoginResponse>('api/user/edit', newInfo, {
                headers: this.authService.httpHeaders
            })
            .pipe(
                map(x => {
                    if (x) {
                        this.localStorageService.token = x.token;
                        return x;
                    } else {
                        return null;
                    }
                })
            );
    }
}
