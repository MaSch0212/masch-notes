import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DayRatingOverviewComponent } from './day-rating-overview.component';

describe('DayRatingOverviewComponent', () => {
  let component: DayRatingOverviewComponent;
  let fixture: ComponentFixture<DayRatingOverviewComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DayRatingOverviewComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DayRatingOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
