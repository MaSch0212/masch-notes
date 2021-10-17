import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateApiKeyDialogComponent } from './create-api-key-dialog.component';

describe('CreateApiKeyDialogComponent', () => {
    let component: CreateApiKeyDialogComponent;
    let fixture: ComponentFixture<CreateApiKeyDialogComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [CreateApiKeyDialogComponent]
        }).compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(CreateApiKeyDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
