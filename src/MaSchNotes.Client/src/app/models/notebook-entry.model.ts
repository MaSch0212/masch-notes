import { Helpers } from '../common/helpers';

export class NotebookEntry {
    id: number;
    name: string;
    category: string;
    date: Date;
    content: string;

    constructor(init?: Partial<NotebookEntry>) {
        Object.assign(this, init);
    }

    static fromJSON(json: any): NotebookEntry {
        return new NotebookEntry({
            id: json.id,
            name: json.name,
            category: json.category,
            date: json.date ? new Date(json.date) : null,
            content: json.content
        });
    }

    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            category: this.category,
            date: this.date
                ? this.date.getFullYear() +
                  '-' +
                  Helpers.formatNumber(this.date.getMonth() + 1, 2) +
                  '-' +
                  Helpers.formatNumber(this.date.getDate(), 2) +
                  'T00:00:00'
                : null,
            content: this.content
        };
    }
}
