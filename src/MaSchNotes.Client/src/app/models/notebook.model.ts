import { NotebookEntry } from './notebook-entry.model';
export class Notebook {
    id: number;
    name: string;
    isDiary: boolean;
    entries: Array<NotebookEntry> = [];

    constructor(init?: Partial<Notebook>) {
        Object.assign(this, init);
    }

    static fromJSON(json: any): Notebook {
        return new Notebook({
            id: json.id,
            name: json.name,
            isDiary: json.isDiary,
            entries: json.entries
                ? json.entries.map((x: any) => NotebookEntry.fromJSON(x))
                : []
        });
    }
}
