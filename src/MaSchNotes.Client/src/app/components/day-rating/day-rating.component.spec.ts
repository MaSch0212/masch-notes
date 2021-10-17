import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DayRatingComponent } from './day-rating.component';

describe('DayRatingComponent', () => {
  let component: DayRatingComponent;
  let fixture: ComponentFixture<DayRatingComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DayRatingComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DayRatingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
