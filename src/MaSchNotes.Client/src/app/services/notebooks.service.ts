import { Injectable } from '@angular/core';
import { AuthenticationService } from './authentication.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Notebook } from '../models/notebook.model';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotebookEntry } from '../models/notebook-entry.model';

@Injectable({
    providedIn: 'root'
})
export class NotebooksService {
    constructor(
        private authService: AuthenticationService,
        private httpClient: HttpClient
    ) {}

    getNotebooks(loadEntries = false, includeContent = false): Observable<Notebook[]> {
        return this.httpClient
            .get<any[]>('api/notebooks', {
                headers: this.authService.httpHeaders,
                params: {
                    loadEntries: String(loadEntries),
                    includeContent: String(includeContent)
                }
            })
            .pipe(map(x => x.map(y => Notebook.fromJSON(y))));
    }

    getNotebookEntries(notebookId: number, includeContent = false): Observable<NotebookEntry[]> {
        return this.httpClient
            .get<any[]>(`api/notebooks/${notebookId}`, {
                headers: this.authService.httpHeaders,
                params: {
                    includeContent: String(includeContent)
                }
            })
            .pipe(map(x => x.map(y => NotebookEntry.fromJSON(y))));
    }


    addNotebook(notebook: Notebook): Observable<number> {
        return this.httpClient
            .put<number>('api/notebooks', notebook, {
                headers: this.authService.httpHeaders
            });
    }

    getNotebook(notebookId: number, loadEntries = false, includeContent = false): Observable<Notebook> {
        return this.httpClient
            .get<any>(`api/notebooks/${notebookId}`, {
                headers: this.authService.httpHeaders,
                params: {
                    loadEntries: String(loadEntries),
                    includeContent: String(includeContent)
                }
            })
            .pipe(map(x => Notebook.fromJSON(x)));
    }

    updateNotebook(notebookId: number, notebook: Notebook): Observable<void> {
        return this.httpClient
            .post<void>(`api/notebooks/${notebookId}`, notebook, {
                headers: this.authService.httpHeaders
            });
    }

    deleteNotebook(notebookId: number): Observable<void> {
        return this.httpClient
            .delete<void>(`api/notebooks/${notebookId}`, {
                headers: this.authService.httpHeaders
            });
    }


    addNotebookEntry(notebookId: number, entry: NotebookEntry): Observable<number> {
        return this.httpClient
            .put<number>(`api/notebooks/${notebookId}`, entry.toJSON(), {
                headers: this.authService.httpHeaders
            });
    }

    getNotebookEntry(notebookId: number, entryId: number): Observable<NotebookEntry> {
        return this.httpClient
            .get<any>(`api/notebooks/${notebookId}/${entryId}`, {
                headers: this.authService.httpHeaders
            })
            .pipe(map(x => NotebookEntry.fromJSON(x)));
    }

    updateNotebookEntry(notebookId: number, entryId: number, entry: NotebookEntry): Observable<void> {
        return this.httpClient
            .post<void>(`api/notebooks/${notebookId}/${entryId}`, entry.toJSON(), {
                headers: this.authService.httpHeaders
            });
    }

    deleteNotebookEntry(notebookId: number, entryId: number): Observable<void> {
        return this.httpClient
            .delete<void>(`api/notebooks/${notebookId}/${entryId}`, {
                headers: this.authService.httpHeaders
            });
    }


    getNotebookCategories(notebookId: number): Observable<string[]> {
        return this.httpClient
            .get<string[]>(`api/notebooks/${notebookId}/categories`, {
                headers: this.authService.httpHeaders
            });
    }
}
