import { Component, OnInit, Inject, Input, Output, EventEmitter } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { RatingDay } from '../day-rating.component';

@Component({
  selector: 'masch-calendar-rate-day',
  templateUrl: './calendar-rate-day.component.html',
  styleUrls: ['./calendar-rate-day.component.scss']
})
export class CalendarRateDayComponent implements OnInit {
  private _day: RatingDay;

  @Input()
  public set day(value: RatingDay) {
    this._day = value;
    value.isSelected = true;
  }
  public get day(): RatingDay {
    return this._day;
  }

  constructor(private overlayRef: OverlayRef) {
    overlayRef.backdropClick().subscribe(() => this.closeOverlay());
  }

  ngOnInit() { }

  closeOverlay() {
    this.overlayRef.dispose();
    this.day.isSelected = false;
  }
}
