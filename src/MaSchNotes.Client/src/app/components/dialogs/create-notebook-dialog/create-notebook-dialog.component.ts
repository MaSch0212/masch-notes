import { Component, OnInit } from '@angular/core';
import { NgForm } from '@angular/forms';
import { NotebooksService } from '../../../services/notebooks.service';
import { Notebook } from '../../../models/notebook.model';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'masch-create-notebook-dialog',
    templateUrl: './create-notebook-dialog.component.html',
    styleUrls: ['./create-notebook-dialog.component.scss']
})
export class CreateNotebookDialogComponent implements OnInit {
    errorMessage: string;

    constructor(
        private notebooksService: NotebooksService,
        private snackbar: MatSnackBar,
        private dialogRef: MatDialogRef<CreateNotebookDialogComponent>
    ) {}

    ngOnInit() {}

    onSubmit(form: NgForm) {
        if (!form.valid) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }

        const notebook = new Notebook({
            name: form.value.name,
            isDiary: !!form.value.isDiary
        });
        this.notebooksService.addNotebook(notebook).subscribe(
            notebookId => {
                notebook.id = notebookId;
                this.dialogRef.close(notebook);
            },
            (error: HttpErrorResponse) => {
                this.errorMessage = error.error;
                this.snackbar.open('Saving notebook failed', null, {
                    panelClass: ['mat-warn']
                });
            }
        );
    }
}
