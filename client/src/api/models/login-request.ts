export type LoginRequest = {
    username: string;

    /**
     * Only for legacy accounts that are not migrated yet.
     */
    password?: string;

    /**
     * Derived authentication key (v2 accounts).
     */
    authKey?: string;

    stayLoggedIn: boolean;
  };
