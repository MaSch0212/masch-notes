import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NotebookEntry } from '../../../../models/notebook-entry.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NgForm } from '@angular/forms';
import {
    ActivatedRoute,
    Params,
    ActivatedRouteSnapshot,
    Routes,
    Router
} from '@angular/router';
import { Notebook } from '../../../../models/notebook.model';
import { MatDialog } from '@angular/material/dialog';
import { NotebooksService } from '../../../../services/notebooks.service';
import { EncryptionService } from '../../../../services/encryption.service';
import {
    WarningDialogComponent,
    WarningDialogData,
    WarningDialogResult
} from '../../../dialogs/warning-dialog/warning-dialog.component';
import { Observable, of, timer } from 'rxjs';
import { map, flatMap, catchError } from 'rxjs/operators';
import { BaseComponent } from '@masch212/angular-common';
import { LocalStorageService } from '../../../../services/local-storage.service';
import { AuthenticationService } from '../../../../services/authentication.service';

@Component({
    selector: 'masch-notebook-entry',
    templateUrl: './notebook-entry.component.html',
    styleUrls: ['./notebook-entry.component.scss']
})
export class NotebookEntryComponent extends BaseComponent implements OnInit {
    @ViewChild('f', { static: false }) form: NgForm;

    date: Date;
    notebook: Notebook;
    originalEntry: NotebookEntry;
    isNewEntry: boolean;
    isSubmitting = false;
    knownCategories: string[];
    selectedCategory: string;

    constructor(
        private snackbar: MatSnackBar,
        private route: ActivatedRoute,
        private router: Router,
        private dialog: MatDialog,
        private notebooksService: NotebooksService,
        private encryptionService: EncryptionService,
        private authenticationService: AuthenticationService,
        private localStorageService: LocalStorageService
    ) {
        super();
    }

    ngOnInit() {
        this.route.url.subscribe(() =>
            this.loadEntryFromRoute(this.route.snapshot)
        );
        /*setTimeout(() => {
            this.authenticationService
                .createEncryptKey()
                .subscribe(encryptKey => {
                    let firstAutosave: string;
                    this.subscriptionManager.addSubscription(
                        timer(5000, 5000).subscribe(() => {
                            if (!this.notebook || !this.originalEntry) {
                                return;
                            }
                            if (!firstAutosave) {
                                firstAutosave = this.getAutosave();
                                return;
                            }
                            const autosaveData = this.getAutosave();
                            if (firstAutosave !== autosaveData) {
                                this.localStorageService.entryAutosave = this.encryptionService.encryptWithKey(
                                    autosaveData,
                                    encryptKey
                                );
                            } else {
                                this.localStorageService.removeentryAutosave();
                            }
                        })
                    );
                });
        });*/
    }

    /*getAutosave(): string {
        const object = Object.assign({}, this.form.value);
        if (!this.isNewEntry) {
            object.entryid = this.originalEntry
                ? this.originalEntry.id
                : -1;
        }
        object.notebookid = this.notebook
            ? this.notebook.id
            : -1;
        return JSON.stringify(object);
    }*/

    loadEntryFromRoute(routeSnapshot: ActivatedRouteSnapshot) {
        const notebookid = routeSnapshot.params['notebookid'];
        const entryid = routeSnapshot.params['entryid'];
        this.isNewEntry = !entryid;

        this.notebooksService.getNotebook(notebookid).subscribe(notebook => {
            this.notebook = notebook;
            if (notebook.isDiary) {
                if (this.isNewEntry) {
                    this.date = new Date();
                }
            } else {
                this.notebooksService
                    .getNotebookCategories(notebookid)
                    .subscribe(
                        categories => (this.knownCategories = categories)
                    );
            }
        });

        if (entryid) {
            this.notebooksService
                .getNotebookEntry(notebookid, entryid)
                .subscribe(
                    entry => {
                        this.encryptionService
                            .decrypt(entry.content)
                            .pipe(catchError(() => of(undefined)))
                            .subscribe(content => {
                                if (content) {
                                    this.originalEntry = entry;
                                    setTimeout(() => {
                                        this.form.form.patchValue({
                                            name: entry.name,
                                            date: entry.date,
                                            category: entry.category,
                                            content: content
                                        });
                                    });
                                } else {
                                    this.snackbar.open(
                                        'Content could not be decrypted.',
                                        null,
                                        { panelClass: ['mat-warn'] }
                                    );
                                    this.navigateBack();
                                }
                            });
                    },
                    () =>
                        this.snackbar.open('Entry could not be loaded', null, {
                            panelClass: ['mat-warn']
                        })
                );
        } else {
            this.originalEntry = new NotebookEntry();
        }
    }

    onCreateNewCategory() {}

    onClose() {
        if (!this.form.pristine) {
            const dialogRef = this.dialog.open(WarningDialogComponent, {
                data: <WarningDialogData>{
                    title: 'Save entry?',
                    message: 'Do you want to save your changes before leaving?',
                    showCancelButton: true,
                    yesButtonColor: 'primary',
                    noButtonColor: 'warn'
                }
            });
            dialogRef.afterClosed().subscribe((result: WarningDialogResult) => {
                if (result === WarningDialogResult.Yes) {
                    this.onSubmit().subscribe(submitResult => {
                        if (submitResult) {
                            this.navigateBack();
                        }
                    });
                } else if (result === WarningDialogResult.No) {
                    this.navigateBack();
                }
            });
        } else {
            this.navigateBack();
        }
    }

    onSubmit(): Observable<boolean> {
        if (!this.form.valid) {
            this.snackbar.open('Please fill in all required fields.');
            return of(false);
        }

        this.isSubmitting = true;
        return this.encryptionService.encrypt(this.form.value.content).pipe(
            flatMap(content => {
                const entry = new NotebookEntry({
                    id: this.originalEntry.id,
                    date: this.form.value.date,
                    name: this.form.value.name,
                    category: this.form.value.category
                        ? this.form.value.category
                        : null,
                    content: content
                });
                if (this.isNewEntry) {
                    return this.notebooksService
                        .addNotebookEntry(this.notebook.id, entry)
                        .pipe(
                            map(() => true),
                            catchError(() => of(false))
                        );
                } else {
                    return this.notebooksService
                        .updateNotebookEntry(this.notebook.id, entry.id, entry)
                        .pipe(
                            map(() => true),
                            catchError(() => of(false))
                        );
                }
            }),
            flatMap(result => {
                if (result) {
                    this.form.form.markAsPristine();
                    this.snackbar.open('Entry was saved sucessfully');
                } else {
                    this.snackbar.open('Saving the entry failed', null, {
                        panelClass: ['mat-warn']
                    });
                }
                return of(result);
            })
        );
    }

    onDeleteEntry() {
        const type = this.notebook.isDiary ? 'diary' : 'notebook';
        const dialogRef = this.dialog.open(WarningDialogComponent, {
            data: <WarningDialogData>{
                title: `Delete ${type} entry`,
                message: `Do you really want to delete the ${type} entry "${
                    this.notebook.isDiary
                        ? this.originalEntry.date.toLocaleDateString()
                        : this.originalEntry.name
                }"?`
            }
        });
        dialogRef.afterClosed().subscribe((result: WarningDialogResult) => {
            if (result !== WarningDialogResult.Yes) {
                return;
            }
            this.notebooksService
                .deleteNotebookEntry(this.notebook.id, this.originalEntry.id)
                .subscribe(
                    () => {
                        this.router.navigate(['..'], {
                            relativeTo: this.route
                        });
                        this.snackbar.open(
                            `${
                                this.notebook.isDiary ? 'Diary' : 'Notebook'
                            } entry has been deleted`
                        );
                    },
                    () => {
                        this.snackbar.open(
                            `Deleting ${type} entry failed`,
                            null,
                            {
                                panelClass: ['mat-warn']
                            }
                        );
                    }
                );
        });
    }

    private navigateBack() {
        this.router.navigate(['..'], { relativeTo: this.route });
    }
}
