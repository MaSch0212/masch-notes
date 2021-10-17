import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NgForm } from '@angular/forms';

export interface TextInputDialogData {
    title: string;
    message: string;
    defaultValue: string;
    inputPlaceholder: string;
    allowEmpty: boolean;
    validationFunc: (input: string) => string;
}

@Component({
    selector: 'masch-text-input-dialog',
    templateUrl: './text-input-dialog.component.html',
    styleUrls: ['./text-input-dialog.component.scss']
})
export class TextInputDialogComponent implements OnInit {
    @ViewChild("f", { static: false }) form: NgForm;
    errorMessage: string;

    constructor(
        private dialogRef: MatDialogRef<TextInputDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: TextInputDialogData
    ) {
        data.defaultValue = data.defaultValue || '';
    }

    ngOnInit() {
        setTimeout(() => {
            this.form.form.patchValue({
                input: this.data.defaultValue
            })
        })
    }

    onOk() {
        if (!this.form.valid) {
            this.errorMessage = "Please fill in some text."
            return;
        }

        this.errorMessage = this.data.validationFunc ? this.data.validationFunc(this.form.value.input) : null;
        if (!this.errorMessage) {
            this.dialogRef.close(this.form.value.input);
        }
    }
}
