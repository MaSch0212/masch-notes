import { Component, OnInit, Input } from '@angular/core';
import { ApiKey } from '../../../models/apikey.model';
import { SettingsService } from '../../../services/settings.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CreateApiKeyDialogComponent } from '../../dialogs/create-api-key-dialog/create-api-key-dialog.component';
import { HttpErrorResponse } from '@angular/common/http';
import {
    DeleteWarningDialogComponent,
    DeleteWarningDialogData
} from '../../dialogs/delete-warning-dialog/delete-warning-dialog.component';

@Component({
    selector: 'masch-api-keys',
    templateUrl: './api-keys.component.html',
    styleUrls: ['./api-keys.component.css']
})
export class ApiKeysComponent implements OnInit {
    @Input() apiKeys: ApiKey[];

    constructor(
        private dialog: MatDialog,
        private settingsService: SettingsService,
        private snackbar: MatSnackBar
    ) {}

    ngOnInit() {}

    onGenerateApiKey() {
        const dialogRef = this.dialog.open(CreateApiKeyDialogComponent);
        dialogRef.afterClosed().subscribe(result => {
            if (result && result instanceof ApiKey) {
                this.apiKeys.push(result);
            }
        });
    }

    onDeleteApiKey(index: number) {
        const dialogRef = this.dialog.open(DeleteWarningDialogComponent, {
            data: <DeleteWarningDialogData>{
                title: 'Delete API Key',
                message: `Do you really want to delete the API Key "${
                    this.apiKeys[index].name
                }"?`
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (!result) {
                return;
            }

            this.settingsService.deleteApiKey(this.apiKeys[index].id).subscribe(
                () => {
                    this.apiKeys.splice(index, 1);
                    this.snackbar.open('API Key has been deleted');
                },
                (error: HttpErrorResponse) => {
                    this.snackbar.open(
                        `Failed to delete API Key${
                            error.error ? ': ' + error.error : ''
                        }`
                    );
                }
            );
        });
    }
}
