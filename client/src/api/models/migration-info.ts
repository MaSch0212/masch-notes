import type { MigrationStatus } from './migration-status';

export type MigrationInfo = {
    status: MigrationStatus;

    /**
     * Salt of the legacy encryption key (settings row -1), if the user has one.
     */
    legacySalt?: string;

    kdfSalt?: string;
    kdfIterations?: number;
    wrappedKey?: string;
    totalEntries: number;
    migratedEntries: number;
  };
