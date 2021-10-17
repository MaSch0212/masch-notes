import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateNotebookDialogComponent } from './create-notebook-dialog.component';

describe('CreateNotebookDialogComponent', () => {
  let component: CreateNotebookDialogComponent;
  let fixture: ComponentFixture<CreateNotebookDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CreateNotebookDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateNotebookDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
