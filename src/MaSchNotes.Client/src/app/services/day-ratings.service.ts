import { Injectable } from '@angular/core';
import { AuthenticationService } from './authentication.service';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DayRatingsService {
    constructor(
        private authService: AuthenticationService,
        private httpClient: HttpClient
    ) {}

    public getRatings(
        minDate?: Date,
        maxDate?: Date
    ): Observable<{ [date: string]: number }> {
        return this.httpClient.get<{ [date: string]: number }>(
            `api/dayratings`,
            {
                headers: this.authService.httpHeaders,
                params: {
                    minDate: minDate.toISOString(),
                    maxDate: maxDate.toISOString()
                }
            }
        );
    }

    public getRating(date: Date): Observable<number> {
        return this.httpClient.get<number>(
            `api/dayratings/${encodeURIComponent(date.toISOString())}`,
            {
                headers: this.authService.httpHeaders
            }
        );
    }

    public setRating(date: Date, rating: number): Observable<void> {
        return this.httpClient.put<void>(
            `api/dayratings/${encodeURIComponent(date.toISOString())}`,
            rating,
            {
                headers: this.authService.httpHeaders
            }
        );
    }
}
