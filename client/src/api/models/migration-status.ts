export type MigrationStatus = ('none') | ('migrating') | ('done');

/**
 * All possible values of the enum `MigrationStatus`.
 */
export const MIGRATION_STATUS_VALUES = ['none', 'migrating', 'done'] as const;
