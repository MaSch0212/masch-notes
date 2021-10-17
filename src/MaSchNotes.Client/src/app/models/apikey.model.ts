export class ApiKey {
    id: number;
    name: string;
    createdAt: Date;

    constructor(init?: Partial<ApiKey>) {
        Object.assign(this, init);
    }

    static fromJSON(json: any): ApiKey {
        return new ApiKey({
            id: json.id,
            name: json.name,
            createdAt: json.createdAt ? new Date(json.createdAt) : null
        });
    }
}
