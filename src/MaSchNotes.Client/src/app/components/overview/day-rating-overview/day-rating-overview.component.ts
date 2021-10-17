import { Component, OnInit } from '@angular/core';
import { DayRatingsService } from '../../../services/day-ratings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BaseComponent } from '@masch212/angular-common';
import { fromEvent } from 'rxjs';
import { AuthenticationService } from '../../../services/authentication.service';

@Component({
    selector: 'masch-day-rating-overview',
    templateUrl: './day-rating-overview.component.html',
    styleUrls: ['./day-rating-overview.component.scss']
})
export class DayRatingOverviewComponent extends BaseComponent
    implements OnInit {
    public lastDays: Array<{ date: Date; rating: number }>;
    public selectedDay: { date: Date; rating: number };

    constructor(
        private authenticationService: AuthenticationService,
        private dayRatingsService: DayRatingsService,
        private snackbar: MatSnackBar
    ) {
        super();
        this.subscriptionManager.add(
            fromEvent(document, 'visibilitychange').subscribe(() => {
                if (document.visibilityState === 'visible' && authenticationService.isLoggedIn) {
                    this.loadData();
                }
            })
        );
    }

    ngOnInit() {
        this.loadData();
    }

    loadData() {
        const minDate = new Date();
        minDate.setDate(minDate.getDate() - 6);
        this.dayRatingsService.getRatings(minDate, new Date()).subscribe(
            ratings => {
                const currentDate = new Date(minDate);
                const result = new Array<{ date: Date; rating: number }>();
                for (let i = 0; i < 7; i++) {
                    const key = Object.keys(ratings).find(
                        x => new Date(x).getDate() === currentDate.getDate()
                    );
                    result.push({
                        date: new Date(currentDate),
                        rating: key ? ratings[key] : null
                    });
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                this.lastDays = result;
                this.selectedDay = result[result.length - 1];
            },
            () => {
                this.snackbar.open('Ratings could not be loaded', null, {
                    panelClass: ['mat-warn']
                });
            }
        );
    }
}
