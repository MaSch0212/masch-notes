import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';
import { Observable, fromEvent } from 'rxjs';
import { Breakpoints, BreakpointObserver } from '@angular/cdk/layout';
import { map, filter } from 'rxjs/operators';
import { Router, ActivationEnd } from '@angular/router';
import { AuthenticationService } from '../services/authentication.service';
import { BaseComponent } from '@masch212/angular-common';
import { AuthGuardService } from '../services/auth-guard.service';

@Component({
    selector: 'masch-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent extends BaseComponent implements OnInit {
    @ViewChild('drawer', { static: true }) sidenav: MatSidenav;
    @ViewChild('content', { static: true }) contentElement: ElementRef;

    isHandset$: Observable<boolean> = this.breakpointObserver
        .observe(Breakpoints.Handset)
        .pipe(map(result => result.matches));

    isLoggedIn = false;

    constructor(
        private authGuard: AuthGuardService,
        private router: Router,
        private breakpointObserver: BreakpointObserver,
        private authService: AuthenticationService
    ) {
        super();
        this.subscriptionManager.add(
            fromEvent(document, 'visibilitychange').subscribe(() => {
                if (document.visibilityState === 'visible') {
                    this.authGuard
                        .canActivate(
                            this.router.routerState.snapshot.root.firstChild,
                            this.router.routerState.snapshot
                        )
                        .subscribe();
                }
            })
        );
    }

    ngOnInit() {
        this.router.events
            .pipe(filter(event => event instanceof ActivationEnd))
            .subscribe(() => {
                this.isLoggedIn = this.authService.isLoggedIn;
            });
    }

    onMenuItemClicked() {
        if (this.breakpointObserver.isMatched(Breakpoints.Handset)) {
            this.sidenav.close();
        }
    }
}
