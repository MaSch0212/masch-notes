import { beforeEach, describe, expect, it } from 'vitest';
import vectors from '../../../server/internal/auth/testdata/vectors.json';
import { clearDataKey, loadDataKey } from './crypto/key-store';
import { decryptLegacy } from './crypto/legacy';
import { decryptContent, encryptContent } from './crypto/v2';
import { createFakeServer, seedV2Account, type FakeServer } from './fake-server';
import { createSession, STORAGE_KEYS } from './session';

let server: FakeServer;

beforeEach(async () => {
  await clearDataKey();
  localStorage.clear();
  server = createFakeServer({ username: 'TestUser', scheme: 'v2' });
});

describe('session', () => {
  it('login v2 stores data key', async () => {
    const dataKey = await seedV2Account(server, 'TestUser', 'secret pw');
    const cipher = await encryptContent(dataKey, 'hello');
    const session = createSession(server.createApi);

    expect(await session.login('TestUser', 'secret pw', true)).toBe('ok');
    expect(session.state.token).toBe('tok');
    expect(session.state.user?.username).toBe('TestUser');
    expect(await decryptContent(session.state.dataKey!, cipher)).toBe('hello');
    expect(await loadDataKey()).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.token)).toBe('tok');
    expect(localStorage.getItem(STORAGE_KEYS.loginName)).toBe('TestUser');
  });

  it('login legacy returns migrate with two legacy keys when casing differs', async () => {
    server.account = {
      username: 'TestUser',
      scheme: 'legacy',
      password: vectors.password,
      legacySalt: vectors.legacyKeySalt,
    };
    const session = createSession(server.createApi);

    expect(await session.login('testuser', vectors.password, false)).toBe('migrate');
    expect(session.state.legacyKeys).toHaveLength(2);
    expect(session.state.migration?.status).toBe('none');
    expect(session.state.dataKey).toBeNull();
    // Only the key from the stored account name decrypts; the typed-name key does not.
    await expect(
      decryptLegacy(session.state.legacyKeys[0]!, vectors.ciphertext),
    ).rejects.toBeInstanceOf(Error);
    expect(await decryptLegacy(session.state.legacyKeys[1]!, vectors.ciphertext)).toBe(
      vectors.plaintext,
    );
    expect(session.migrationPassword()).toBe(vectors.password);
  });

  it('restore logs out when key missing', async () => {
    const session = createSession(server.createApi);
    server.migration = {
      kdfSalt: 'x',
      kdfIterations: 1,
      wrappedKey: 'x',
      authKey: 'x',
      status: 'done',
    };
    localStorage.setItem(STORAGE_KEYS.token, 'tok');
    localStorage.setItem(STORAGE_KEYS.expiresAt, new Date(Date.now() + 60_000).toISOString());
    localStorage.setItem(
      STORAGE_KEYS.user,
      JSON.stringify({ id: 1, username: 'TestUser', givenName: '', surname: '', email: '' }),
    );

    expect(await session.restore()).toBe(false);
    expect(session.state.token).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.token)).toBeNull();
  });

  it('changePassword rewraps same data key', async () => {
    const dataKey = await seedV2Account(server, 'TestUser', 'old pw');
    const cipher = await encryptContent(dataKey, 'keep me');
    const session = createSession(server.createApi);
    await session.login('TestUser', 'old pw', false);

    await expect(session.changePassword('wrong', 'new pw')).rejects.toMatchObject({
      code: 'wrongPassword',
    });
    expect(session.state.token).toBe('tok');

    await session.changePassword('old pw', 'new pw');
    const other = createSession(server.createApi);
    expect(await other.login('TestUser', 'new pw', false)).toBe('ok');
    expect(await decryptContent(other.state.dataKey!, cipher)).toBe('keep me');
  });

  it('register stores a usable data key and logout clears it', async () => {
    const session = createSession(server.createApi);
    await session.register({
      username: 'neu',
      password: 'pw',
      givenName: 'A',
      surname: 'B',
      email: 'a@b.c',
    });
    expect(session.state.dataKey).not.toBeNull();
    expect(server.account.scheme).toBe('v2');
    await session.logout();
    expect(await loadDataKey()).toBeNull();
    expect(session.state.token).toBeNull();
  });
});
