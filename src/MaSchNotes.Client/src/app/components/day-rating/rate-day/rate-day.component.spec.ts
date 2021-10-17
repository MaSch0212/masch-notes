import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RateDayComponent } from './rate-day.component';

describe('RateDayComponent', () => {
  let component: RateDayComponent;
  let fixture: ComponentFixture<RateDayComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RateDayComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RateDayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
