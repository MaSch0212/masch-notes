export type RegisterRequest = {
    username: string;
    authKey: string;
    kdfSalt: string;
    kdfIterations: number;
    wrappedKey: string;
    givenName: string;
    surname: string;
    email: string;
  };
