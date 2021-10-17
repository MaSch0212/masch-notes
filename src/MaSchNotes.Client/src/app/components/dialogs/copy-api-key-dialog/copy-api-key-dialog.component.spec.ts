import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CopyApiKeyDialogComponent } from './copy-api-key-dialog.component';

describe('CopyApiKeyDialogComponent', () => {
    let component: CopyApiKeyDialogComponent;
    let fixture: ComponentFixture<CopyApiKeyDialogComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [CopyApiKeyDialogComponent]
        }).compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(CopyApiKeyDialogComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
