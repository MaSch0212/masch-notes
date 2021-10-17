import { Component, OnInit } from '@angular/core';
import { Notebook } from '../../../models/notebook.model';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { NotebookEntry } from '../../../models/notebook-entry.model';
import { NotebooksService } from '../../../services/notebooks.service';
import { MatDialog } from '@angular/material/dialog';
import {
    WarningDialogComponent,
    WarningDialogData,
    WarningDialogResult
} from '../../dialogs/warning-dialog/warning-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DatePipe } from '@angular/common';
import {
    TextInputDialogComponent,
    TextInputDialogData
} from '../../dialogs/text-input-dialog/text-input-dialog.component';

interface NotebookEntryGroup {
    name: string;
    entries: Array<NotebookEntry>;
    isExpanded: boolean;
}

@Component({
    selector: 'masch-notebook',
    templateUrl: './notebook.component.html',
    styleUrls: ['./notebook.component.scss']
})
export class NotebookComponent implements OnInit {
    notebook: Notebook;
    entryGroups: Array<NotebookEntryGroup>;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private notebooksService: NotebooksService,
        private dialog: MatDialog,
        private snackbar: MatSnackBar,
        private datePipe: DatePipe
    ) {}

    ngOnInit() {
        this.route.params.subscribe((params: Params) =>
            this.loadNotebook(params['notebookid'])
        );
    }

    onDeleteNotebook() {
        const type = this.notebook.isDiary ? 'diary' : 'notebook';
        const dialogRef = this.dialog.open(WarningDialogComponent, {
            data: <WarningDialogData>{
                title: `Delete ${type}`,
                message: `Do you really want to delete the ${type} "${this.notebook.name}"?`
            }
        });
        dialogRef.afterClosed().subscribe((result: WarningDialogResult) => {
            if (result !== WarningDialogResult.Yes) {
                return;
            }
            this.notebooksService.deleteNotebook(this.notebook.id).subscribe(
                () => {
                    this.router.navigate(['..'], { relativeTo: this.route });
                    this.snackbar.open(
                        `${
                            this.notebook.isDiary ? 'Diary' : 'Notebook'
                        } has been deleted`
                    );
                },
                () => {
                    this.snackbar.open(`Deleting ${type} failed`, null, {
                        panelClass: ['mat-warn']
                    });
                }
            );
        });
    }

    onEditNotebook() {
        const type = this.notebook.isDiary ? 'diary' : 'notebook';
        const dialogRef = this.dialog.open(TextInputDialogComponent, {
            data: <TextInputDialogData>{
                title: `Change name of ${type}`,
                message: `Type in a new name for the ${type} "${this.notebook.name}":`,
                allowEmpty: false,
                defaultValue: this.notebook.name,
                inputPlaceholder: 'New name'
            }
        });
        dialogRef.beforeClosed().subscribe(name => {
            if (!name) {
                return;
            }
            this.notebooksService
                .updateNotebook(
                    this.notebook.id,
                    new Notebook({ ...this.notebook, name: name, entries: [] })
                )
                .subscribe(
                    () => {
                        this.notebook.name = name;
                        this.snackbar.open(
                            `${
                                this.notebook.isDiary ? 'Diary' : 'Notebook'
                            } has been renamed`
                        );
                    },
                    () => {
                        this.snackbar.open(`Renaming ${type} failed`, null, {
                            panelClass: ['mat-warn']
                        });
                    }
                );
        });
    }

    private loadNotebook(id: number): void {
        this.notebooksService.getNotebook(id, true).subscribe(notebook => {
            const groups: Array<NotebookEntryGroup> = [
                {
                    name: 'No category',
                    entries: new Array<NotebookEntry>(),
                    isExpanded: false
                }
            ];

            const entries = notebook.entries.sort(
                notebook.isDiary
                    ? this.compareNotebookEntriesByDate
                    : this.compareNotebookEntriesByName
            );
            entries.forEach(item => {
                const category = notebook.isDiary
                    ? this.datePipe.transform(item.date, 'MMMM yyyy')
                    : item.category || groups[0].name;
                let group = groups.find(x => x.name === category);
                if (!group) {
                    group = {
                        name: category,
                        entries: [],
                        isExpanded: false
                    };
                    groups.push(group);
                }
                group.entries.push(item);
            });
            if (groups[0].entries.length === 0) {
                groups.shift();
            }
            if (groups.length > 0) {
                groups[0].isExpanded = true;
            }
            this.notebook = notebook;
            this.entryGroups = groups;
        });
    }

    private compareNotebookEntriesByDate(
        a: NotebookEntry,
        b: NotebookEntry
    ): number {
        return a.date > b.date ? -1 : b.date > a.date ? 1 : 0;
    }
    private compareNotebookEntriesByName(
        a: NotebookEntry,
        b: NotebookEntry
    ): number {
        return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
    }
}
