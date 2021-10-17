import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { DayRatingsService } from '../../../services/day-ratings.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
    selector: 'masch-rate-day',
    templateUrl: './rate-day.component.html',
    styleUrls: ['./rate-day.component.scss']
})
export class RateDayComponent implements OnInit {
    private _isInitialized = false;
    private _date: Date;

    @Input() public rating: number;
    @Output() public ratingChange: EventEmitter<number> = new EventEmitter<number>();

    @Input()
    public set date(value: Date) {
        this._date = value;
        if (this._isInitialized && this.date) {
            this.refreshRating();
        }
    }
    public get date(): Date {
        return this._date;
    }

    public possibleRatings = [
        { rating: 0, svg: 'emoticon-dead-outline' },
        { rating: 1, svg: 'emoticon-sad-outline' },
        { rating: 2, svg: 'emoticon-neutral-outline' },
        { rating: 3, svg: 'emoticon-happy-outline' },
        { rating: 4, svg: 'emoticon-excited-outline' }
    ];
    public isSaving = false;

    constructor(private dayRatingsService: DayRatingsService, private snackbar: MatSnackBar) {}

    ngOnInit() {
        if (this.rating === undefined && this.date) {
            this.refreshRating();
        }
        this._isInitialized = true;
    }

    refreshRating() {
        this.dayRatingsService.getRating(this.date).subscribe(x => {
            this.rating = x;
            this.ratingChange.emit(this.rating);
        });
    }

    changeRating(value: number) {
        if (this.rating === value || this.isSaving) {
            return;
        }

        if (this.date) {
            this.isSaving = true;
            this.dayRatingsService.setRating(this.date, value).subscribe(() => {
                this.snackbar.open('Rating was saved successfully');
                this.rating = value;
                this.ratingChange.emit(this.rating);
                this.isSaving = false;
            }, () => {
                this.snackbar.open('Rating could not be saved', null, {
                    panelClass: ['mat-warn']
                });
                this.isSaving = false;
            })
        } else {
            this.rating = value;
            this.ratingChange.emit(this.rating);
        }
    }
}
