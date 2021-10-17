import { Component, OnInit, Input } from '@angular/core';
import { Notebook } from '../../models/notebook.model';
import { NotebooksService } from '../../services/notebooks.service';
import { MatDialog } from '@angular/material/dialog';
import { CreateNotebookDialogComponent } from '../dialogs/create-notebook-dialog/create-notebook-dialog.component';
import { Helpers } from '../../common/helpers';

@Component({
    selector: 'masch-notebooks',
    templateUrl: './notebooks.component.html',
    styleUrls: ['./notebooks.component.scss']
})
export class NotebooksComponent implements OnInit {
    @Input() useTileView = false;
    @Input() showCreateButton = true;

    selectedNotebook: number;

    notebooks: Notebook[];

    constructor(
        private notebooksService: NotebooksService,
        private dialog: MatDialog
    ) {}

    ngOnInit() {
        this.notebooksService
            .getNotebooks()
            .subscribe(x => (this.notebooks = x.sort(this.compareNotebooks)));
    }

    onCreateNotebook() {
        const dialogRef = this.dialog.open(CreateNotebookDialogComponent, {});
        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                Helpers.insertIntoSortedArray(this.notebooks, result, this.compareNotebooks);
            }
        });
    }

    private compareNotebooks(a: Notebook, b: Notebook): number {
        return a.name > b.name ? 1 : b.name > a.name ? -1 : 0;
    }
}
