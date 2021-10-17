import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { NotebookOverviewComponent } from './notebook-overview.component';

describe('NotebookOverviewComponent', () => {
  let component: NotebookOverviewComponent;
  let fixture: ComponentFixture<NotebookOverviewComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ NotebookOverviewComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NotebookOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
