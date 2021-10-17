import { Component, OnInit, ElementRef, Injector } from '@angular/core';
import { DayRatingsService } from '../../services/day-ratings.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal, PortalInjector } from '@angular/cdk/portal';
import { CalendarRateDayComponent } from './calendar-rate-day/calendar-rate-day.component';

export interface RatingDay {
    date: Date;
    dayOfWeek: number;
    weekOfMonth: number;
    rating: number;
    isSelected: boolean;
}

@Component({
    selector: 'masch-day-rating',
    templateUrl: './day-rating.component.html',
    styleUrls: ['./day-rating.component.scss']
})
export class DayRatingComponent implements OnInit {
    private _ratingDayCache: { [month: string]: RatingDay[] } = {};
    public currentMonth: Date;
    public currentRatingDays: RatingDay[];
    public today = new Date();

    constructor(
        private _injector: Injector,
        private dayRatingsService: DayRatingsService,
        private snackbar: MatSnackBar,
        private overlay: Overlay
    ) {}

    ngOnInit() {
        this.loadMonth(this.today.getFullYear(), this.today.getMonth());
    }

    canGoToNextMonth() {
        return (
            this.today <
            new Date(
                this.currentMonth.getFullYear(),
                this.currentMonth.getMonth() + 1
            )
        );
    }

    loadMonth(year: number, month: number) {
        const next = new Date(year, month);
        const cacheKey = `${next.getFullYear()}-${next.getMonth()}`;
        let result = this._ratingDayCache[cacheKey];
        if (!result) {
            const firstDay = next;
            const lastDay = new Date(year, month + 1, 0);
            this.dayRatingsService
                .getRatings(
                    new Date(Date.UTC(year, month)),
                    new Date(Date.UTC(year, month + 1, 0))
                )
                .subscribe(
                    ratings => {
                        result = [];
                        const firstDayDay = (firstDay.getDay() + 6) % 7;
                        for (let i = 1; i <= lastDay.getDate(); i++) {
                            const key = Object.keys(ratings).find(
                                x => new Date(x).getDate() === i
                            );
                            const date = new Date(year, month, i);
                            result.push({
                                date,
                                dayOfWeek: (date.getDay() + 6) % 7,
                                weekOfMonth: Math.ceil((i + firstDayDay) / 7),
                                rating: key ? ratings[key] : null,
                                isSelected: false
                            });
                        }
                        this._ratingDayCache[cacheKey] = result;
                        this.currentMonth = next;
                        this.currentRatingDays = result;
                    },
                    () => {
                        this.snackbar.open(
                            'Ratings could not be loaded',
                            null,
                            {
                                panelClass: ['mat-warn']
                            }
                        );
                    }
                );
        } else {
            this.currentMonth = next;
            this.currentRatingDays = result;
        }
    }

    changeRating(day: RatingDay, event: Event) {
        if (day.date == null || day.date > this.today) {
            return;
        }

        const overlayRef = this.overlay.create({
            height: 'auto',
            width: '500px',
            hasBackdrop: true,
            backdropClass: 'cdk-overlay-transparent-backdrop',
            panelClass: ['cdk-overlay-pane', 'masch-overlay-pane'],
            positionStrategy: this.overlay
                .position()
                .flexibleConnectedTo(
                    document.getElementById(
                        ((event.target || event.currentTarget) as any).id
                    )
                )
                .withPositions([
                    {
                        originX: 'center',
                        originY: 'bottom',
                        overlayX: 'center',
                        overlayY: 'top'
                    }
                ])
        });
        const userProfilePortal = new ComponentPortal(
            CalendarRateDayComponent,
            null,
            this.createInjector(overlayRef, this._injector)
        );
        const componentRef = overlayRef.attach(userProfilePortal);
        componentRef.instance.day = day;

    }

    createInjector(ref: OverlayRef, inj: Injector) {
        const injectorTokens = new WeakMap([[OverlayRef, ref]]);
        return new PortalInjector(inj, injectorTokens);
    }
}
