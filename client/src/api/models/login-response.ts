import type { KeyScheme } from './key-scheme';
import type { MigrationInfo } from './migration-info';
import type { User } from './user';

export type LoginResponse = {
    token: string;
    expiresAt: string;
    user: User;
    scheme: KeyScheme;
    wrappedKey?: string;
    migration?: MigrationInfo;
  };
