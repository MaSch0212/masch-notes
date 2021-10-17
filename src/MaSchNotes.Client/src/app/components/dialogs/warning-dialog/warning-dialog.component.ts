import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface WarningDialogData {
    title: string;
    message: string;
    yesButtonColor: string;
    noButtonColor: string;
    cancelButtonColor: string;
    showCancelButton: boolean;
}

export enum WarningDialogResult {
    Yes,
    No,
    Cancel,
}

@Component({
    selector: 'masch-warning-dialog',
    templateUrl: './warning-dialog.component.html',
    styleUrls: ['./warning-dialog.component.scss']
})
export class WarningDialogComponent implements OnInit {
    WarningDialogResult = WarningDialogResult;

    constructor(
        private dialogRef: MatDialogRef<WarningDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: WarningDialogData
    ) {
        data.yesButtonColor = data.yesButtonColor || "warn";
        data.noButtonColor = data.noButtonColor || "";
        data.cancelButtonColor = data.cancelButtonColor || "";
    }

    ngOnInit() {}
}
