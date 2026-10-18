import { createStore } from 'solid-js/store';
import type { LoginResponse } from '../api/models/login-response';
import type { MigrationInfo } from '../api/models/migration-info';
import type { User } from '../api/models/user';
import { ApiRequestError, createApi, unwrap, type Api } from './api';
import { fromBase64, toBase64 } from './base64';
import { deriveLegacyEncryptPass, deriveLegacyKey } from './crypto/legacy';
import { clearDataKey, loadDataKey, saveDataKey } from './crypto/key-store';
import {
  deriveKeys,
  generateDataKey,
  KDF_ITERATIONS,
  randomSalt,
  unwrapDataKey,
  wrapDataKey,
} from './crypto/v2';

export const STORAGE_KEYS = {
  token: 'maschnotes.token',
  expiresAt: 'maschnotes.expiresAt',
  user: 'maschnotes.user',
  loginName: 'maschnotes.loginName',
} as const;

export type SessionState = {
  token: string | null;
  user: User | null;
  expiresAt: Date | null;
  dataKey: CryptoKey | null;
  migration: MigrationInfo | null;
  legacyKeys: CryptoKey[];
};

export type RegisterInput = {
  username: string;
  password: string;
  givenName: string;
  surname: string;
  email: string;
};

export type ApiFactory = (getToken: () => string | null, onUnauthorized: () => void) => Api;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

const emptyState = (): SessionState => ({
  token: null,
  user: null,
  expiresAt: null,
  dataKey: null,
  migration: null,
  legacyKeys: [],
});

async function deriveLegacyKeys(
  names: string[],
  password: string,
  saltB64: string | undefined,
): Promise<CryptoKey[]> {
  if (!saltB64) return [];
  const unique = [...new Set(names.filter(Boolean))];
  return Promise.all(
    unique.map(async (n) => deriveLegacyKey(await deriveLegacyEncryptPass(n, password), saltB64)),
  );
}

export function createSession(makeApi: ApiFactory = (t, u) => createApi(t, u)) {
  const [state, setState] = createStore<SessionState>(emptyState());
  // Kept out of the reactive store; only needed while a legacy migration is pending.
  let legacyPassword: string | null = null;

  const api = makeApi(
    () => state.token,
    () => void logout(),
  );

  async function logout(): Promise<void> {
    write(STORAGE_KEYS.token, null);
    write(STORAGE_KEYS.expiresAt, null);
    write(STORAGE_KEYS.user, null);
    legacyPassword = null;
    setState(emptyState());
    try {
      await clearDataKey();
    } catch {
      // nothing to clear
    }
  }

  async function establish(res: LoginResponse, loginName: string, dataKey: CryptoKey | null) {
    const expiresAt = new Date(res.expiresAt);
    write(STORAGE_KEYS.token, res.token);
    write(STORAGE_KEYS.expiresAt, expiresAt.toISOString());
    write(STORAGE_KEYS.user, JSON.stringify(res.user));
    write(STORAGE_KEYS.loginName, loginName);
    if (dataKey) await saveDataKey(dataKey, expiresAt);
    setState({
      token: res.token,
      user: res.user,
      expiresAt,
      dataKey,
      migration: null,
      legacyKeys: [],
    });
  }

  /** Returns `migrate` when the account still uses the legacy scheme. */
  async function login(
    username: string,
    password: string,
    stayLoggedIn: boolean,
  ): Promise<'ok' | 'migrate'> {
    const pre = await unwrap(api.auth.prelogin({ username }));
    if (pre.scheme === 'v2') {
      const { authKey, wrapKey } = await deriveKeys(
        password,
        fromBase64(pre.kdfSalt ?? ''),
        pre.kdfIterations ?? KDF_ITERATIONS,
      );
      const res = await unwrap(api.auth.login({ username, authKey, stayLoggedIn }));
      let dataKey: CryptoKey;
      try {
        dataKey = await unwrapDataKey(wrapKey, res.wrappedKey ?? '');
      } catch {
        throw new ApiRequestError('invalidCredentials', 401);
      }
      await establish(res, username, dataKey);
      return 'ok';
    }

    const res = await unwrap(api.auth.login({ username, password, stayLoggedIn }));
    const migration: MigrationInfo = res.migration ?? {
      status: 'none',
      totalEntries: 0,
      migratedEntries: 0,
    };
    const keys = await deriveLegacyKeys(
      [username, res.user.username],
      password,
      migration.legacySalt,
    );
    await establish(res, username, null);
    legacyPassword = password;
    setState({ migration, legacyKeys: keys });
    return 'migrate';
  }

  async function register(input: RegisterInput): Promise<void> {
    const salt = randomSalt();
    const { authKey, wrapKey } = await deriveKeys(input.password, salt, KDF_ITERATIONS);
    const wrappedKey = await wrapDataKey(wrapKey, await generateDataKey());
    const res = await unwrap(
      api.auth.register({
        username: input.username,
        authKey,
        kdfSalt: toBase64(salt),
        kdfIterations: KDF_ITERATIONS,
        wrappedKey,
        givenName: input.givenName,
        surname: input.surname,
        email: input.email,
      }),
    );
    // Store the non-extractable variant of the key.
    const dataKey = await unwrapDataKey(wrapKey, wrappedKey);
    await establish(res, input.username, dataKey);
  }

  async function restore(): Promise<boolean> {
    const token = read(STORAGE_KEYS.token);
    const expires = read(STORAGE_KEYS.expiresAt);
    const userJson = read(STORAGE_KEYS.user);
    if (!token || !expires || !userJson || new Date(expires).getTime() <= Date.now()) {
      await logout();
      return false;
    }
    let user: User;
    try {
      user = JSON.parse(userJson) as User;
    } catch {
      await logout();
      return false;
    }
    setState({ token, user, expiresAt: new Date(expires) });
    try {
      await unwrap(api.auth.checkToken());
    } catch {
      await logout();
      return false;
    }
    const dataKey = await loadDataKey().catch(() => null);
    if (dataKey) {
      setState({ dataKey });
      return true;
    }
    // No key: only valid while a legacy account has not finished migrating.
    try {
      const info = await unwrap(api.crypto.getMigration());
      if (info.status !== 'done') {
        setState({ migration: info });
        return true;
      }
    } catch {
      // fall through to logout
    }
    await logout();
    return false;
  }

  /** Derives the legacy keys from the (re-)entered password after a reload during migration. */
  async function prepareMigration(password: string): Promise<void> {
    const keys = await deriveLegacyKeys(
      [read(STORAGE_KEYS.loginName) ?? '', state.user?.username ?? ''],
      password,
      state.migration?.legacySalt,
    );
    legacyPassword = password;
    setState({ legacyKeys: keys });
  }

  /** Non-reactive: the password typed at the legacy login or entered in the migration modal. */
  function migrationPassword(): string | null {
    return legacyPassword;
  }

  /** Called when the migration is complete: the account now behaves like any v2 account. */
  async function finishMigration(dataKey: CryptoKey): Promise<void> {
    if (state.expiresAt) await saveDataKey(dataKey, state.expiresAt);
    legacyPassword = null;
    setState({
      dataKey,
      legacyKeys: [],
      migration: {
        ...(state.migration ?? { totalEntries: 0, migratedEntries: 0 }),
        status: 'done',
      },
    });
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const dataKey = state.dataKey;
    const username = state.user?.username;
    if (!dataKey || !username) throw new ApiRequestError('unauthorized', 401);
    // Separate, token-less client: a wrong password must not look like an expired session.
    const anon = makeApi(
      () => null,
      () => {},
    );
    const pre = await unwrap(anon.auth.prelogin({ username }));
    const old = await deriveKeys(
      oldPassword,
      fromBase64(pre.kdfSalt ?? ''),
      pre.kdfIterations ?? KDF_ITERATIONS,
    );
    // The stored key is non-extractable, so fetch the wrapped key again (also verifies the password).
    let wrapped: string;
    try {
      const res = await unwrap(
        anon.auth.login({ username, authKey: old.authKey, stayLoggedIn: false }),
      );
      wrapped = res.wrappedKey ?? '';
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'invalidCredentials') {
        throw new ApiRequestError('wrongPassword', 401);
      }
      throw e;
    }
    const extractable = await unwrapDataKey(old.wrapKey, wrapped, true);
    const salt = randomSalt();
    const next = await deriveKeys(newPassword, salt, KDF_ITERATIONS);
    await unwrap(
      api.auth.changePassword({
        oldAuthKey: old.authKey,
        newAuthKey: next.authKey,
        kdfSalt: toBase64(salt),
        kdfIterations: KDF_ITERATIONS,
        wrappedKey: await wrapDataKey(next.wrapKey, extractable),
      }),
    );
  }

  return {
    state,
    api,
    login,
    register,
    restore,
    logout,
    changePassword,
    prepareMigration,
    migrationPassword,
    finishMigration,
  };
}

export type Session = ReturnType<typeof createSession>;

export const session: Session = createSession();
