export class User {
    id?: number;
    givenName?: string;
    surname?: string;
    email?: string;

    constructor(init?: Partial<User>) {
        Object.assign(this, init);
    }

    static fromJSON(json: any): User {
        return new User({
            id: json.id,
            givenName: json.givenName,
            surname: json.surname,
            email: json.email
        });
    }
}
