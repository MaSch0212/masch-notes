import type { KeyScheme } from './key-scheme';

export type PreloginResponse = {
    scheme: KeyScheme;
    kdfSalt?: string;
    kdfIterations?: number;
  };
