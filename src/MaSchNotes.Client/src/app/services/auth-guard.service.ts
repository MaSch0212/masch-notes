import { Injectable } from '@angular/core';
import {
    CanActivate,
    UrlTree,
    RouterStateSnapshot,
    ActivatedRouteSnapshot,
    Router
} from '@angular/router';
import { Observable } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class AuthGuardService implements CanActivate {
    constructor(
        private authService: AuthenticationService,
        private router: Router
    ) {}

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean> {
        const isLoginCall = route.routeConfig.path === 'login';
        const isLogoffCall = route.routeConfig.path === 'logoff';

        return this.authService.checkTokenValid().pipe(
            map(tokenValid => {
                if (isLogoffCall) {
                    tokenValid = false;
                    this.authService.logoff();
                }
                if (isLoginCall && tokenValid) {
                    this.router.navigate(['']);
                } else if (!isLoginCall && !tokenValid) {
                    this.router.navigate(
                        ['login'],
                        isLogoffCall
                            ? undefined
                            : {
                                  queryParams: {
                                      redirectTo: state.url
                                  }
                              }
                    );
                }
                return isLoginCall !== tokenValid;
            })
        );
    }
}
