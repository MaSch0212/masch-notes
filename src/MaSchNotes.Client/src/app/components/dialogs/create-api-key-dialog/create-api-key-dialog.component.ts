import { Component, OnInit } from '@angular/core';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { SettingsService } from '../../../services/settings.service';
import { HttpErrorResponse } from '@angular/common/http';
import {
    CopyApiKeyDialogComponent,
    CopyApiKeyDialogData
} from '../copy-api-key-dialog/copy-api-key-dialog.component';

@Component({
    selector: 'masch-create-api-key-dialog',
    templateUrl: './create-api-key-dialog.component.html',
    styleUrls: ['./create-api-key-dialog.component.css']
})
export class CreateApiKeyDialogComponent implements OnInit {
    keyName: string;
    errorMsg: string;
    isLoading: boolean = false;

    constructor(
        private dialogRef: MatDialogRef<CreateApiKeyDialogComponent>,
        private dialog: MatDialog,
        private settingsService: SettingsService
    ) {}

    ngOnInit() {}

    onCreateClicked() {
        if (!this.keyName) {
            this.errorMsg = 'Please provide a name.';
            return;
        }

        this.isLoading = true;
        this.settingsService.createApiKey(this.keyName).subscribe(
            response => {
                this.isLoading = false;
                this.dialogRef.close(response.keyInfo);
                this.dialog.open(CopyApiKeyDialogComponent, {
                    data: <CopyApiKeyDialogData>{
                        key: response.key,
                        keyInfo: response.keyInfo
                    }
                });
            },
            (error: HttpErrorResponse) => {
                this.isLoading = false;
                this.errorMsg = error.error
                    ? error.error
                    : `${error.status} (${error.statusText})`;
            }
        );
    }
}
