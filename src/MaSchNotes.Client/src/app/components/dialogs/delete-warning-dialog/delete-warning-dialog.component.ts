import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface DeleteWarningDialogData {
    title: string;
    message: string;
}

@Component({
    selector: 'masch-delete-warning-dialog',
    templateUrl: './delete-warning-dialog.component.html',
    styleUrls: ['./delete-warning-dialog.component.css']
})
export class DeleteWarningDialogComponent implements OnInit {
    constructor(
        private dialogRef: MatDialogRef<DeleteWarningDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: DeleteWarningDialogData
    ) {}

    ngOnInit() {}
}
