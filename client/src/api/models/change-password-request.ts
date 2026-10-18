export type ChangePasswordRequest = {
    oldAuthKey: string;
    newAuthKey: string;
    kdfSalt: string;
    kdfIterations: number;
    wrappedKey: string;
  };
