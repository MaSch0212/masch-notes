import { ApiKey } from './apikey.model';

export class Settings {
    apiKeys: ApiKey[];

    constructor(init?: Partial<Settings>) {
        Object.assign(this, init);
    }

    static fromJSON(json: any): Settings {
        return new Settings({
            apiKeys: json.apiKeys
                ? json.apiKeys.map((x: any) => ApiKey.fromJSON(x))
                : []
        });
    }
}
