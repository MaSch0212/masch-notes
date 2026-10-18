export type StartMigrationRequest = {
    kdfSalt: string;
    kdfIterations: number;
    wrappedKey: string;
    authKey: string;
  };
