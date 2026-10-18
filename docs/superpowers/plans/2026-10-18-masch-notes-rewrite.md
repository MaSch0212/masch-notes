# MaSch Notes Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ASP.NET/Angular MaSch Notes app with a Go server + SolidJS client generated from one OpenAPI spec, adding key-wrapped encryption with password change, a crash-safe legacy migration, a calendar-first responsive UI in German/English, and optional AI voice entries.

**Architecture:** `api/openapi.yaml` → goast generates `server/internal/api` (Go models + `net/http` service interfaces) and `client/src/api` (TS models + fetch clients). The Go server implements the generated interfaces over `modernc.org/sqlite`, adds hand-written auth middleware, a WebSocket hub for AI job status and an embedded SPA handler. All encryption happens in the browser via WebCrypto; the server stores only salts, wrapped keys and ciphertext.

**Tech Stack:** Go 1.27 (`net/http`, `modernc.org/sqlite`, `golang-jwt/jwt/v5`, `coder/websocket`, `golang.org/x/crypto/argon2`, golangci-lint v2 as a `go tool`), Node 24, pnpm 12 (latest), Vite, SolidJS, `@solidjs/router`, Tailwind CSS 4, `lucide-solid`, `@solid-primitives/i18n`, oxlint, oxfmt, vitest (+ jsdom, `@solidjs/testing-library`), `@goast/core` 0.7.x, `@goast/go` 0.1.x, `@goast/typescript` 0.9.x.

**Spec:** `docs/superpowers/specs/2026-10-18-masch-notes-rewrite-design.md` (read it first; mockups in `docs/superpowers/specs/mockups/`).

## Global Constraints

- pnpm `minimumReleaseAge: 2880` in `pnpm-workspace.yaml`; `packageManager` = latest pnpm; `engines.node: ">=24"`; `.node-version` = `24`.
- `renovate.json`: `minimumReleaseAge: "2 days"` for `npm` and `gomod`.
- Never modify the production DB copy; tests and manual runs use copies.
- Generated code (`server/internal/api`, `client/src/api`) is never hand-edited; regenerate with `pnpm generate`.
- Docker contract: port 80, data dir `/data`, DB `/data/maschnotes.db`, linux/amd64 + linux/arm64, no CGO.
- Legacy constants: PBKDF2-HMAC-SHA1; encrypt pass = PBKDF2(username, UTF-8(password), 5000, 64 bytes) base64; legacy key = PBKDF2(encryptPass string, salt from settings row −1 `pbkdf2:5000:<b64>:32`, 5000, 32 bytes); AES-256-CBC PKCS7, IV = UTF-8 `d6c6b426090a5ae9`.
- v2 constants: `kdfIterations` = 600000, `kdfSalt` = 16 bytes, PBKDF2-SHA256 → 256-bit master key; HKDF-SHA256 info `maschnotes-auth` / `maschnotes-wrap` (empty salt); content = AES-256-GCM, BLOB = 12-byte IV ‖ ciphertext+tag, `encversion = 2`; wrapped key = same layout.
- DB date writes: `yyyy-MM-ddT00:00:00.0000000` for date-only values; API-key timestamps UTC RFC3339 with 7 fractional digits + `Z`. DB date reads accept `yyyy-MM-dd HH:mm:ss[.f…]`, `yyyy-MM-ddTHH:mm:ss[.f…][Z]`, and NULL.
- API dates are `yyyy-MM-dd` strings (`format: date`); the client always computes them from **local** calendar days.
- Mood/rating: integer 0–4 (0 awful … 4 great), user-wide.
- UI language: any `navigator.languages` entry starting with `de` → German, else English. `en` dictionary is the type source; `de` must satisfy it.
- Theme follows `prefers-color-scheme`; icons only from `lucide-solid` (no emoji).
- Layout breakpoints: phone `< 640px`; medium `640–1099px` or height `< 640px`; wide `≥ 1100px` and height `≥ 640px`.
- AI is enabled only when `AI_WHISPER_URL`, `AI_LLM_URL`, `AI_LLM_MODEL` are all set; no audio/transcript/result is ever written to disk.
- Server errors: JSON `{ "code": string, "message": string }`; `code` is a stable camelCase identifier the client translates.
- Go formatting/linting: `go tool golangci-lint fmt` (gofumpt + goimports) and `go tool golangci-lint run` must be clean. Client: `pnpm lint` (oxlint) and `pnpm format:check` (oxfmt) clean.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Legacy login typed with different username casing than at registration → legacy key wrong → migration must retry with stored `accounts.name` before reporting failure. (Task 16 test `retries legacy key with stored account name`.)
- Local-day boundaries: a user in UTC+2 at 00:30 must get today's local date, never yesterday's UTC date. (Task 13 test `toIsoDate uses local calendar day`.)
- Autosave while switching days: pending edits must be flushed to the entry/day they were typed into, not the newly selected one. (Task 18 test `flushes pending save to previous day on navigation`.)
- Two tabs creating the same diary day: second create must not produce a duplicate entry. (Task 8 test `TestCreateDiaryEntryConflict` → 409 with existing id; Task 18 handles 409 by switching to update.)
- Silence / unusable recording: empty transcript must fail the job with `emptyTranscript` and append nothing; oversize audio must be rejected with 413 `audioTooLarge`. (Task 11 tests `TestJobEmptyTranscript`, `TestCreateJobTooLarge`.)

---

## File Structure

```
/package.json                      root scripts, packageManager, engines
/pnpm-workspace.yaml               packages: client, tools/*; minimumReleaseAge
/.node-version  /.gitattributes  /renovate.json  /.oxlintrc.json  /.oxfmtrc.json
/README.md
/Dockerfile  /.dockerignore
/scripts/docker.ps1                build/push with old registry logic
/api/openapi.yaml
/tools/codegen/{package.json,generate.ts}
/server/go.mod
/server/.golangci.yml
/server/cmd/maschnotes/main.go
/server/cmd/legacyfixture/main.go  inserts a synthetic legacy user into a DB copy
/server/cmd/aiprompttest/main.go   runs whisper+LLM pipeline on an audio file
/server/internal/api/              GENERATED
/server/internal/config/config.go
/server/internal/db/{db.go,schema.sql,migrate.go,dates.go}
/server/internal/auth/{legacy.go,argon.go,token.go,middleware.go,context.go}
/server/internal/store/{store.go,users.go,notebooks.go,entries.go,ratings.go,apikeys.go,userkeys.go,migration.go}
/server/internal/service/{errors.go,auth.go,user.go,notebooks.go,ratings.go,apikeys.go,crypto.go,ai.go}
/server/internal/ai/{whisper.go,ollama.go,prompt.go,prompt.txt,jobs.go}
/server/internal/ws/{hub.go,handler.go}
/server/internal/web/{static.go,dist/}     dist/ = client build output (only placeholder committed)
/client/{package.json,index.html,vite.config.ts,tsconfig.json,vitest.config.ts}
/client/public/{manifest.webmanifest,apple-icon.png,apple-splash.jpg,favicon.svg}
/client/src/main.tsx  /client/src/App.tsx  /client/src/index.css
/client/src/api/                   GENERATED
/client/src/lib/{api.ts,dates.ts,errors.ts,session.ts,ws.ts,ai-jobs.ts,migration.ts,base64.ts}
/client/src/lib/crypto/{legacy.ts,v2.ts,key-store.ts}
/client/src/lib/audio/{recorder.ts,wav.ts}
/client/src/lib/i18n/{index.ts,en.ts,de.ts}
/client/src/components/ui/{Button.tsx,TextField.tsx,Modal.tsx,Popover.tsx,Spinner.tsx,Toast.tsx}
/client/src/components/layout/{AppShell.tsx,Sidebar.tsx,IconRail.tsx,BottomTabs.tsx}
/client/src/components/{MoodPicker.tsx,MonthCalendar.tsx,WeekStrip.tsx,EntryEditor.tsx,RecordButton.tsx,RecordPopover.tsx,NotebookDialog.tsx}
/client/src/pages/{LoginPage.tsx,RegisterPage.tsx,DiaryPage.tsx,NotebookPage.tsx,SettingsPage.tsx,HomeRedirect.tsx,MigrationModal.tsx}
```

Tests live next to the code (`*_test.go`, `*.test.ts(x)`).

---

### Task 1: Workspace scaffold and tooling

**Files:**

- Create: `/package.json`, `/pnpm-workspace.yaml`, `/.node-version`, `/.gitattributes`, `/renovate.json`, `/.oxlintrc.json`, `/.oxfmtrc.json`, `/README.md` (skeleton)
- Create: `/server/go.mod`, `/server/.golangci.yml`, `/server/cmd/maschnotes/main.go` (temporary `func main() {}`)
- Create: `/client/package.json`, `/client/index.html`, `/client/vite.config.ts`, `/client/tsconfig.json`, `/client/vitest.config.ts`, `/client/src/main.tsx`, `/client/src/App.tsx`, `/client/src/index.css`, `/client/src/smoke.test.ts`
- Modify: `/.gitignore` (add `node_modules/`, `client/dist/`, `server/internal/web/dist/*` except `.gitkeep`/`index.html` placeholder, `data/`)

**Interfaces:**

- Produces root scripts: `generate`, `generate:check`, `lint`, `format`, `format:check`, `test`, `build`, `dev`; client scripts `dev`, `build`, `test`, `lint`, `format`, `typecheck`; Go invoked as `go -C server …`.

- [ ] **Step 1:** `pnpm-workspace.yaml` with `packages: [client, tools/*]` and `minimumReleaseAge: 2880`; root `package.json` with `"packageManager": "pnpm@<latest>"` (look up with `npm view pnpm version`), `"engines": {"node": ">=24"}`, `"private": true`. `.gitattributes`: `* text=auto eol=lf`.
- [ ] **Step 2:** Client: `pnpm --filter client add solid-js @solidjs/router lucide-solid @solid-primitives/i18n` and dev deps `vite vite-plugin-solid tailwindcss @tailwindcss/vite typescript vitest jsdom @solidjs/testing-library @testing-library/user-event oxlint oxfmt crypto-js @types/crypto-js`. `vite.config.ts`: solid + tailwind plugins, `base: './'`, dev proxy `/api` → `http://localhost:8080` (with `ws: true`). `tsconfig.json`: strict, `jsx: preserve`, `jsxImportSource: solid-js`. `vitest.config.ts`: environment `jsdom`, setup `@testing-library/jest-dom` optional.
- [ ] **Step 3:** `src/smoke.test.ts` with `expect(1 + 1).toBe(2)`; `App.tsx` renders `<p>MaSch Notes</p>`; `index.css` has `@import "tailwindcss";`.
- [ ] **Step 4:** Go: `go mod init github.com/MaSch0212/masch-notes/server` (go 1.27), `go get -tool github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest`. `.golangci.yml` v2: formatters `gofumpt`, `goimports` (local prefix module path); linters default `standard` + `errorlint`, `gosec`, `bodyclose`, `misspell`, `revive`, `noctx`; exclude `internal/api/` from linters (generated).
- [ ] **Step 5: Verify** `pnpm install && pnpm test && pnpm --filter client build && go -C server build ./... && go -C server tool golangci-lint run` → all succeed.
- [ ] **Step 6: Commit** `chore: scaffold pnpm workspace, SolidJS client and Go module`.

### Task 2: OpenAPI spec and code generation

**Files:**

- Create: `/api/openapi.yaml`, `/tools/codegen/package.json`, `/tools/codegen/generate.ts`
- Generated: `/server/internal/api/**`, `/client/src/api/**`

**Interfaces:**

- Produces (OpenAPI 3.1, server URL `/api`, global security `bearer` (http bearer) OR `apiKey` (query `apikey`); operations marked `security: []` are public). Tags → generated Go interfaces `AuthService`, `UserService`, `NotebooksService`, `DayRatingsService`, `ApiKeysService`, `CryptoService`, `AiService` and TS clients with the same tag names.

| Tag        | Op ID                                         | Method + path                                              | Request                                                                                              | Responses                                                                                                                                                       |
| ---------- | --------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | getConfig                                     | GET /config (public)                                       | —                                                                                                    | 200 `AppConfig {registrationEnabled: bool, aiEnabled: bool}`                                                                                                    |
| Auth       | prelogin                                      | POST /auth/prelogin (public)                               | `PreloginRequest {username}`                                                                         | 200 `PreloginResponse {scheme: "legacy"\|"v2", kdfSalt?: byte(b64), kdfIterations?: int}`                                                                       |
| Auth       | login                                         | POST /auth/login (public)                                  | `LoginRequest {username, password?, authKey?: b64, stayLoggedIn: bool}`                              | 200 `LoginResponse {token, expiresAt: date-time, user: User, scheme, wrappedKey?: b64, migration?: MigrationInfo}`; 401 Error                                   |
| Auth       | register                                      | POST /auth/register (public)                               | `RegisterRequest {username, authKey, kdfSalt, kdfIterations, wrappedKey, givenName, surname, email}` | 201 LoginResponse; 403 (disabled); 409 (`usernameTaken`)                                                                                                        |
| Auth       | checkToken                                    | GET /auth/check                                            | —                                                                                                    | 204                                                                                                                                                             |
| Auth       | changePassword                                | POST /auth/password                                        | `ChangePasswordRequest {oldAuthKey, newAuthKey, kdfSalt, kdfIterations, wrappedKey}`                 | 204; 401 `wrongPassword`; 409 `migrationRequired`                                                                                                               |
| User       | getUser / updateUser                          | GET, PUT /user                                             | `UpdateUserRequest {givenName, surname, email}`                                                      | 200 `User {id: int64, username, givenName, surname, email}`                                                                                                     |
| Notebooks  | listNotebooks / createNotebook                | GET, POST /notebooks                                       | `NotebookInput {name, isDiary}`                                                                      | 200 `Notebook[] {id, name, isDiary}` / 201 Notebook                                                                                                             |
| Notebooks  | getNotebook / renameNotebook / deleteNotebook | GET, PUT, DELETE /notebooks/{notebookId}                   | `RenameNotebookRequest {name}`                                                                       | 200 / 200 / 204; 404                                                                                                                                            |
| Notebooks  | listEntries                                   | GET /notebooks/{notebookId}/entries?from&to&includeContent | query `from`,`to`: date (optional), `includeContent`: bool                                           | 200 `NotebookEntry[] {id, name?, category?, date?: date, encVersion: int, content?: b64}`                                                                       |
| Notebooks  | createEntry                                   | POST /notebooks/{notebookId}/entries                       | `EntryInput {name?, category?, date?, content: b64}`                                                 | 201 NotebookEntry; 409 `ConflictError {code: "entryExists", entryId}` (diary date taken)                                                                        |
| Notebooks  | getEntry / updateEntry / deleteEntry          | GET, PUT, DELETE /notebooks/{notebookId}/entries/{entryId} | EntryInput                                                                                           | 200 / 200 / 204                                                                                                                                                 |
| Notebooks  | listCategories                                | GET /notebooks/{notebookId}/categories                     | —                                                                                                    | 200 `string[]`                                                                                                                                                  |
| DayRatings | listRatings                                   | GET /day-ratings?from&to                                   | dates (required)                                                                                     | 200 `DayRating[] {date, rating}`                                                                                                                                |
| DayRatings | setRating / clearRating                       | PUT, DELETE /day-ratings/{date}                            | `RatingInput {rating: 0..4}`                                                                         | 200 DayRating / 204                                                                                                                                             |
| ApiKeys    | listApiKeys / createApiKey / deleteApiKey     | GET, POST /api-keys; DELETE /api-keys/{keyId}              | `ApiKeyInput {name}`                                                                                 | 200 `ApiKey[] {id, name, createdAt}` / 201 `CreatedApiKey {key, apiKey}` / 204                                                                                  |
| Crypto     | getMigration                                  | GET /crypto/migration                                      | —                                                                                                    | 200 `MigrationInfo {status: "none"\|"migrating"\|"done", legacySalt?: b64, kdfSalt?, kdfIterations?, wrappedKey?, totalEntries: int, migratedEntries: int}`     |
| Crypto     | startMigration                                | POST /crypto/migration/start                               | `StartMigrationRequest {kdfSalt, kdfIterations, wrappedKey, authKey}`                                | 200 MigrationInfo (existing row returned unchanged on resume)                                                                                                   |
| Crypto     | listPendingEntries                            | GET /crypto/migration/pending?limit (default 50, max 200)  | —                                                                                                    | 200 `PendingEntry[] {id, notebookId, notebookName, name?, date?, content: b64}`                                                                                 |
| Crypto     | uploadMigratedEntries                         | POST /crypto/migration/entries                             | `MigratedEntry[] {id, content: b64}`                                                                 | 204                                                                                                                                                             |
| Crypto     | skipEntries                                   | POST /crypto/migration/skip                                | `SkipEntriesRequest {entryIds: int64[]}`                                                             | 204                                                                                                                                                             |
| Crypto     | completeMigration                             | POST /crypto/migration/complete                            | —                                                                                                    | 204; 409 `migrationIncomplete`                                                                                                                                  |
| Ai         | createAiJob                                   | POST /ai/jobs                                              | multipart `audio` (binary), `kind` (`diary`\|`notebook`), `date?`, `title?`                          | 202 `AiJobCreated {jobId}`; 404 `aiDisabled`; 413 `audioTooLarge`                                                                                               |
| Ai         | getAiJob / cancelAiJob                        | GET, DELETE /ai/jobs/{jobId}                               | —                                                                                                    | 200 `AiJob {jobId, status: queued\|transcribing\|composing\|done\|failed\|cancelled, result?: AiResult {text, mood?: int\|null, title?}, error?: string}` / 204 |

Also under `components.schemas` (not on any path; for generated types): `WsClientMessage {type: "auth", token}`, `WsServerMessage {type: "authOk"|"error"|"aiJob", job?: AiJob, error?: string}`, `Error {code, message}`. Every operation declares `default: Error`.

- [ ] **Step 1:** Write `api/openapi.yaml` per the table (ids, schemas, `required` lists exactly as written; `?` = optional).
- [ ] **Step 2:** `tools/codegen/generate.ts` (run with `tsx`): two separate `OpenApiGenerator` runs (each clears only its own output dir):
  - Go: `outputDir: 'server/internal'`, `clearOutputDir: false`, `.useType(GoModelsGenerator, {modulePath: 'github.com/MaSch0212/masch-notes/server/internal', packagePath: 'api'}).useType(GoServersGenerator, {…same, basePath: '/api'})`. Delete `server/internal/api` before the run (it must not clear sibling packages).
  - TS: `outputDir: 'client/src/api'`, `.useType(TypeScriptModelsGenerator).useType(TypeScriptFetchClientsGenerator)`.
  - Then run `gofmt -l` sanity and `oxfmt client/src/api`.
    Root script `generate` → `pnpm --filter codegen start`; `generate:check` → generate then `git diff --exit-code -- server/internal/api client/src/api`.
- [ ] **Step 3: Verify** `pnpm generate && go -C server build ./... && pnpm --filter client typecheck` succeed. Then list the generated Go service interfaces/method names and TS client class/method names in the commit message body, so later tasks can look them up.
- [ ] **Step 4:** If goast cannot express something (e.g. multipart field, multiple security schemes), keep the spec correct, work around it in hand-written code, and write the gap into `docs/goast-notes.md` for Marc.
- [ ] **Step 5: Commit** `feat(api): hand-written OpenAPI spec and goast code generation`.

### Task 3: Server configuration

**Files:** Create `server/internal/config/config.go`, `server/internal/config/config_test.go`

**Interfaces:**

- Produces `type Config struct { Port int; DataDir string; JWTKey []byte /* nil if unset */; BasePath string; AllowRegistration bool; AI AIConfig }`, `type AIConfig struct { WhisperURL, WhisperLanguage, LLMURL, LLMModel, PromptFile string; LLMThink bool; MaxAudioBytes int64; Timeout time.Duration }`, `func (a AIConfig) Enabled() bool`, `func Load(getenv func(string) string) (Config, error)`.

- [ ] **Step 1: Failing tests** `TestLoadDefaults` (empty env → Port 80, DataDir "data", AllowRegistration true, WhisperLanguage "auto", MaxAudioBytes 50<<20, Timeout 10m, AI.Enabled() false); `TestLoadContainerDataDir` (`DOTNET_RUNNING_IN_CONTAINER=true` → "/data"; `DATA_DIR` wins over it); `TestLoadAliases` (`path-base=/MaSchNotes/` → BasePath "/MaSchNotes"; `PathBase` same; `JWT__key=abc` → JWTKey "abc"; `BASE_PATH`/`JWT_KEY` win over aliases); `TestAIEnabledNeedsAllThree`; `TestLoadInvalidPort` → error.
- [ ] **Step 2:** Run `go -C server test ./internal/config/` → FAIL.
- [ ] **Step 3:** Implement. BasePath normalised: leading `/`, no trailing `/`, empty for `/`.
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(server): configuration from env with legacy aliases`.

### Task 4: Database open, schema, dates, migrations

**Files:** Create `server/internal/db/{db.go,schema.sql,migrate.go,dates.go}` + `db_test.go`, `dates_test.go`, `migrate_test.go`; test fixture `server/internal/db/testdata/legacy_schema.sql` (the exact production `sqlite_master` DDL incl. backtick tables and `UQ_categories_notebookid_name` index — copy from `node -e` dump of the production DB copy copy).

**Interfaces:**

- Produces `func Open(path string) (*sql.DB, error)` (driver `sqlite`, DSN pragmas `foreign_keys(1)`, `journal_mode(WAL)`, `busy_timeout(5000)`; `SetMaxOpenConns(1)`), `func Migrate(ctx context.Context, db *sql.DB, dbPath string, now func() time.Time) error`, `func ParseTime(s string) (time.Time, error)`, `func ParseNullTime(ns sql.NullString) (*time.Time, error)`, `func FormatDate(t time.Time) string`, `func FormatTimestamp(t time.Time) string`, `func DateOnly(s string) (time.Time, error)` (API `yyyy-MM-dd` → midnight UTC-less civil date).
- `schema.sql` = original `CreateTables.sql` verbatim. Migration 1 per spec §6: `userkeys` table (plus column `pendingauthhash TEXT NULL` holding the new argon2id hash during migration); `notebookentries` columns `encversion INTEGER NOT NULL DEFAULT 1`, `contentv2 BLOB NULL`, `migrationskipped INTEGER NOT NULL DEFAULT 0`.

- [ ] **Step 1: Failing tests:** `TestParseTimeFormats` (`2023-10-22 00:00:00`, `2014-10-07T00:00:00.0000000`, `2020-09-19T11:17:49.4301152Z`, `2021-01-01 10:00:00.1234567` all parse; garbage errors); `TestFormatDate` (`2026-10-18` → `2026-10-18T00:00:00.0000000`); `TestFormatTimestamp` (→ `2026-10-18T09:05:03.1234567Z`); `TestMigrateFreshDB` (empty file → all legacy tables + `userkeys` exist, `user_version`=1, no backup file created); `TestMigrateLegacyDB` (DB built from `testdata/legacy_schema.sql` with a few rows → backup `maschnotes.db.bak-20261018-120000` exists and opens with the same row counts, columns added, old rows have `encversion`=1, `user_version`=1); `TestMigrateIdempotent` (second run: no new backup, no error).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (`PRAGMA wal_checkpoint(TRUNCATE)` then `VACUUM INTO` the backup path — produces a consistent copy). **Step 4:** Run → PASS.
- [ ] **Step 5: Verify against prod copy:** copy the production DB copy to a temp dir in a test guarded by env `MASCHNOTES_PROD_COPY` (skip when unset): migrate, assert counts users 5, notebooks 6, notebookentries 1010, dayratings 648, apikeys 2. Run `MASCHNOTES_PROD_COPY=<path to prod copy> go -C server test ./internal/db/ -run Prod` → PASS (test copies the file first; never opens the original read-write).
- [ ] **Step 6: Commit** `feat(server): sqlite open, legacy schema, date formats, versioned migrations with backup`.

### Task 5: Password/key primitives and tokens

**Files:** Create `server/internal/auth/{legacy.go,argon.go,token.go}` + tests.

**Interfaces:**

- `func VerifyLegacyHash(password, stored string) bool` (empty stored + empty password → true), `func NewLegacyHash(password string) string` (test helper use only; 8-byte salt, 24-byte hash, 5000 it.), `func ParseLegacyKeyParams(v string) (salt []byte, err error)` (expects 4 parts, `pbkdf2`, `5000`, b64 salt, `32`).
- `func HashAuthKey(authKey []byte) (string, error)` (argon2id m=65536 KiB, t=3, p=1, 16-byte salt, 32-byte key, PHC string `argon2id$v=19$m=65536,t=3,p=1$<b64raw salt>$<b64raw hash>`), `func VerifyAuthKey(authKey []byte, stored string) bool` (constant-time).
- `type Tokens struct{…}`, `func NewTokens(key []byte, now func() time.Time) *Tokens`, `func (t *Tokens) Issue(userID int64, stayLoggedIn bool) (token string, expires time.Time, err error)` (HS512, claims `sub`=userID, `exp`; 365 days vs 2 hours), `func (t *Tokens) Parse(token string) (userID int64, err error)`.
- `func FakeKdfSalt(secret []byte, username string) []byte` (HMAC-SHA256(secret, lower(username))[:16]).

- [ ] **Step 1: Generate .NET vectors** (dotnet is installed): create `server/internal/auth/testdata/vectors.cs` file-based app computing `Rfc2898DeriveBytes(password, salt, 5000)` (SHA1) for a fixed salt and printing a legacy hash string, an encrypt pass for (`TestUser`, `pässwörd`) and a legacy key for that encrypt pass with salt `AAECAwQFBgcICQoLDA0ODw==`. Run `dotnet run server/internal/auth/testdata/vectors.cs` and paste outputs into the Go tests as constants (also reused by the client in Task 14 via `testdata/vectors.json`).
- [ ] **Step 2: Failing tests** `TestVerifyLegacyHashDotNetVector`, `TestVerifyLegacyHashWrongPassword`, `TestVerifyLegacyHashEmptyQuirk`, `TestParseLegacyKeyParams` (valid; wrong part count → error), `TestArgonRoundTrip`, `TestArgonRejectsTampered`, `TestTokensIssueParse`, `TestTokensExpiry` (2h vs 365d via injected clock; expired → error), `TestTokensRejectWrongKey`, `TestFakeKdfSaltDeterministicCaseInsensitive`.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (`crypto/pbkdf2` std lib, `golang.org/x/crypto/argon2`, `golang-jwt/jwt/v5`). **Step 5:** Run → PASS. **Step 6: Commit** `feat(server): legacy and argon2id password verification, JWT tokens`.

### Task 6: Store layer

**Files:** Create `server/internal/store/{store.go,users.go,notebooks.go,entries.go,ratings.go,apikeys.go,userkeys.go,migration.go}` + `store_test.go` (helper `newTestStore(t)` → migrated temp DB), per-file tests.

**Interfaces (all methods take `ctx context.Context` first; `ErrNotFound`, `ErrConflict` sentinel errors):**

- `type Store struct{ DB *sql.DB }`; `func (s *Store) Tx(ctx, fn func(*Store) error) error`.
- Users: `type Account struct{ UserID int64; Username, PasswordHash string }`, `type User struct{ ID int64; Username, GivenName, Surname, Email string }`; `AccountByUsername(name) (Account, error)` (NOCASE), `UserByID(id) (User, error)` (username = first account name), `UsernameTaken(name) (bool, error)`, `CreateUser(username, passwordHash string, u User) (int64, error)`, `UpdateUser(u User) error`, `SetPasswordHash(userID int64, hash string) error`.
- Notebooks: `type Notebook struct{ ID, UserID int64; Name string; IsDiary bool }`; `ListNotebooks(userID)`, `GetNotebook(id) (Notebook, error)`, `CreateNotebook(userID, name, isDiary) (Notebook, error)`, `RenameNotebook(id, name) error`, `DeleteNotebook(id) error`.
- Entries: `type Entry struct{ ID, NotebookID int64; Name, Category *string; Date *time.Time; EncVersion int; Content []byte; HasContentV2 bool }`; `ListEntries(notebookID int64, from, to *time.Time, includeContent bool) ([]Entry, error)` (date filter compares on `substr(date,1,10)` so both stored formats work), `GetEntry(id)`, `EntryByDate(notebookID int64, date time.Time) (Entry, error)`, `CreateEntry(notebookID int64, e Entry) (Entry, error)` (category upsert as old SQL; date written with `FormatDate`), `UpdateEntry(e Entry) error` (category upsert, sets `contentv2 = NULL`, then delete unused categories), `DeleteEntry(id) error` (then delete unused categories), `ListCategories(notebookID) ([]string, error)`.
- Ratings: `ListRatings(userID int64, from, to time.Time) ([]Rating, error)` with `type Rating struct{ Date time.Time; Value int }` (filter by `substr(date,1,10)` between), `SetRating(userID, date, value) error` (`INSERT OR REPLACE`, date via `FormatDate`; first delete any row whose `substr(date,1,10)` matches, so a differently-formatted legacy row can't duplicate), `ClearRating(userID, date) error`, `GetRating(userID, date) (*int, error)`.
- API keys: `type APIKey struct{ ID int64; Name string; CreatedAt time.Time }`; `ListAPIKeys(userID)`, `CreateAPIKey(userID int64, key, name string, at time.Time) (APIKey, error)` (note: `apikeys.id` is INTEGER PK in prod; use `last_insert_rowid`), `DeleteAPIKey(userID, id int64) error` (ErrNotFound if not owned), `UserIDByAPIKey(key) (int64, error)`.
- User keys: `type UserKey struct{ UserID int64; KdfSalt []byte; KdfIterations int; WrappedKey []byte; Status string; PendingAuthHash string }` `GetUserKey(userID) (UserKey, error)`, `UpsertUserKey(k UserKey) error`, `LegacyKeyParams(userID) (string, error)` (settings row −1), `DeleteLegacyKeyParams(userID) error`.
- Migration: `MigrationCounts(userID) (total, migrated int, err error)` (legacy = `encversion=1`; migrated = has `contentv2` or skipped), `PendingEntries(userID int64, limit int) ([]PendingEntry, error)` (`encversion=1 AND contentv2 IS NULL AND skipped=0` joined with notebooks for name), `SetContentV2(userID int64, items map[int64][]byte) error` (only entries owned by user and `encversion=1`), `SkipEntries(userID int64, ids []int64) error`, `FinalizeMigration(userID int64) error` (inside caller's Tx: fail with ErrConflict if any pending remain; `UPDATE … SET content=contentv2, contentv2=NULL, encversion=2 WHERE contentv2 IS NOT NULL`).

- [ ] **Step 1: Failing tests** per area, including: `TestAccountLookupCaseInsensitive`; `TestEntryDatesBothFormats` (insert raw rows with both formats + NULL; `ListEntries` with from/to returns the right ones); `TestCreateEntryCategoryUpsertAndCleanup`; `TestUpdateEntryClearsContentV2`; `TestSetRatingReplacesLegacyFormattedRow` (raw `2025-08-02 00:00:00` row + `SetRating(2025-08-02)` → exactly one row); `TestAPIKeyOwnership`; `TestPendingEntriesExcludesMigratedAndSkipped`; `TestFinalizeMigrationRequiresAll`; `TestFinalizeMigrationSwapsContent`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement with plain `database/sql`. **Step 4:** Run `go -C server test ./internal/...` → PASS.
- [ ] **Step 5: Commit** `feat(server): store layer for users, notebooks, entries, ratings, api keys, keys, migration`.

### Task 7: Auth middleware, error mapping, Auth + User services

**Files:** Create `server/internal/auth/{middleware.go,context.go}`, `server/internal/service/{errors.go,auth.go,user.go}` + tests (`httptest` against the generated `api.Register…Routes`).

**Interfaces:**

- `func WithUserID(ctx, id int64) context.Context`, `func UserID(ctx) (int64, bool)`.
- `func Middleware(tokens *Tokens, apiKeys func(ctx, key string) (int64, error), public func(r *http.Request) bool) func(http.Handler) http.Handler` — Bearer header or `apikey` query param (case-insensitive name like the old `ContainsKey("apikey")`); 401 `Error{code:"unauthorized"}` otherwise; public = getConfig, prelogin, login, register (match by method+path after base path).
- `service.Error{Status int; Code, Message string}` implementing `error`; `func WriteError(w http.ResponseWriter, r *http.Request, err error)` used as the generated server's error handler (`api.WithErrorHandler`); maps `store.ErrNotFound` → 404 `notFound`, generated `*api.RequestError` → 400 `invalidRequest`, unknown → 500 `internal` (logged with `slog`).
- `type AuthService struct{ Store *store.Store; Tokens *auth.Tokens; Cfg config.Config; Secret []byte }` implementing the generated `api.AuthService`; `UserService` implementing `api.UserService`.

Behaviour (spec §7): prelogin returns `legacy` when the account exists and has no `active` userkey row, `v2` with stored salt/iterations when active, fake v2 (salt `FakeKdfSalt`, 600000) when the username is unknown. Login: `authKey` path requires active userkey and `VerifyAuthKey`; `password` path requires legacy account (no active row) and `VerifyLegacyHash`; on legacy success returns `migration` = `MigrationInfo` (with `legacySalt` from settings −1, null if absent). Both return the same 401 `invalidCredentials` for any failure. Register: 403 `registrationDisabled`, 409 `usernameTaken`, validates non-empty fields, `kdfIterations ≥ 600000`, `kdfSalt` 16 bytes; creates user + active userkey in one Tx. changePassword: 409 `migrationRequired` if not active; 401 `wrongPassword` if old key fails; updates hash + userkey in one Tx.

- [ ] **Step 1: Failing tests** `TestMiddlewareBearer`, `TestMiddlewareAPIKeyQuery`, `TestMiddlewarePublicRoutes`, `TestMiddlewareRejectsMissing`; `TestPreloginLegacy`, `TestPreloginV2`, `TestPreloginUnknownLooksV2AndStable`; `TestLoginLegacyReturnsMigrationInfo`, `TestLoginLegacyWrongPassword401`, `TestLoginV2`, `TestLoginV2RejectsPasswordField` (active user sending `password` → 401); `TestRegisterCreatesActiveKey`, `TestRegisterDisabled403`, `TestRegisterUsernameTaken409` (case-insensitive); `TestChangePassword`, `TestChangePasswordWrongOld401`, `TestChangePasswordLegacy409`; `TestUpdateUser`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. **Step 5: Commit** `feat(server): auth middleware, auth and user services`.

### Task 8: Notebooks, day ratings and API key services

**Files:** Create `server/internal/service/{notebooks.go,ratings.go,apikeys.go}` + tests.

**Interfaces:** `NotebooksService`, `DayRatingsService`, `ApiKeysService` implementing the generated interfaces over `*store.Store`. API keys: 32 bytes `crypto/rand` → Base62 (`0-9A-Za-z`, big-endian big-int conversion like Base62-Net; retry on collision).

Rules: every notebook/entry access checks ownership (other user's notebook → 404, entry not in notebook → 404). Content transported base64 ↔ BLOB bytes. `createEntry` in a diary: `date` required (400 `dateRequired`); if an entry for that date exists → 409 `ConflictError{code:"entryExists", entryId}`. Regular notebook: `name` required. `encVersion` of created/updated entries = 2 when the user's key is active, else 1. Rating outside 0..4 → 400 `invalidRating`; `listRatings` requires `from ≤ to` (400).

- [ ] **Step 1: Failing tests** `TestNotebookCRUD`, `TestNotebookOwnership404`, `TestEntryCRUDRoundTripsContentBytes`, `TestCreateDiaryEntryConflict`, `TestCreateDiaryEntryRequiresDate`, `TestListEntriesRangeAndIncludeContent`, `TestEntryEncVersionFollowsUserKey`, `TestRatingsSetListClear`, `TestRatingOutOfRange400`, `TestAPIKeyCreateListDelete`, `TestAPIKeyBase62Alphabet` (43–44 chars, only `[0-9A-Za-z]`), `TestAPIKeyAuthenticatesRequest` (create key, call `GET /api/notebooks?apikey=…` → 200).
- [ ] **Step 2–4:** Run → FAIL; implement; run → PASS. **Step 5: Commit** `feat(server): notebooks, day ratings and api key services`.

### Task 9: Crypto migration service

**Files:** Create `server/internal/service/crypto.go` + `crypto_test.go`.

**Interfaces:** `CryptoService` implementing generated `api.CryptoService` over the store. Behaviour exactly spec §8: `startMigration` creates `userkeys{status:"migrating", pendingauthhash: HashAuthKey(authKey)}` or returns the existing migrating row unchanged; 409 `alreadyMigrated` if active. `uploadMigratedEntries` max 200 items, each content ≥ 28 bytes (IV+tag) else 400. `completeMigration` in one Tx: `FinalizeMigration`, `SetPasswordHash(pendingauthhash)`, status `active`, clear pending hash, `DeleteLegacyKeyParams`; 409 `migrationIncomplete` when pending remain. All endpoints 409 `migrationNotStarted` where a migrating row is required.

- [ ] **Step 1: Failing tests** `TestMigrationStartIsIdempotentResume`, `TestMigrationPendingPagination`, `TestMigrationUploadOnlyOwnLegacyEntries`, `TestMigrationCompleteIncomplete409`, `TestMigrationCompleteSwitchesLogin` (after complete: legacy password login 401, authKey login 200, prelogin `v2`), `TestMigrationSkipThenComplete` (skipped entries stay `encversion=1`, untouched content), `TestMigrationUserWithoutEntries`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(server): crash-safe legacy encryption migration endpoints`.

### Task 10: WebSocket hub

**Files:** Create `server/internal/ws/{hub.go,handler.go}` + `ws_test.go`.

**Interfaces:**

- `type Hub struct{…}`, `func NewHub() *Hub`, `func (h *Hub) Publish(userID int64, msg api.WsServerMessage)`, `func Handler(h *Hub, tokens *auth.Tokens, log *slog.Logger) http.Handler` mounted at `/api/ws` **outside** the auth middleware.
- Protocol: client must send `WsClientMessage{type:"auth"}` within 10 s → server replies `authOk` or `error` + close 4401. Server pings every 30 s; per-connection send buffer 16, slow consumers are dropped. Origin check: same host (`websocket.AcceptOptions{}` default) — the dev proxy forwards the host.

- [ ] **Step 1: Failing tests** `TestWsAuthAndPublish` (two users; message reaches only the right one), `TestWsAuthTimeout`, `TestWsBadToken`, `TestWsMultipleTabsSameUser`.
- [ ] **Step 2–4:** FAIL → implement (`github.com/coder/websocket`, `wsjson`) → PASS. **Step 5: Commit** `feat(server): websocket hub for user events`.

### Task 11: AI clients, prompt and job manager

**Files:** Create `server/internal/ai/{whisper.go,ollama.go,prompt.go,prompt.txt,jobs.go}` + tests; `server/internal/service/ai.go` + test.

**Interfaces:**

- `type Transcriber interface{ Transcribe(ctx, audio io.Reader, filename string) (string, error) }`; `NewWhisper(baseURL, language string, client *http.Client) Transcriber` → `POST {base}/inference` multipart `file`, `response_format=json`, `language` → `{text}`.
- `type Composer interface{ Compose(ctx, in ComposeInput) (ComposeResult, error) }`, `type ComposeInput struct{ Kind, Transcript, Title string; Date *time.Time; Locale string }`, `type ComposeResult struct{ Text string; Mood *int; Title string }`; `NewOllama(baseURL, model string, think bool, systemPrompt string, client *http.Client) Composer` → `POST {base}/api/chat` `{model, stream:false, think, format:<JSON schema {text:string, mood:integer|null 0..4, title:string}>, options:{temperature:0.3}, messages:[system, user]}`; user message contains kind, date and the transcript in a fenced block.
- `func DefaultPrompt() string` (embedded `prompt.txt`, content per spec §9 bullet list; English instructions, says "answer in the transcript's language"), `func LoadPrompt(path string) (string, error)`.
- `func CleanTranscript(s string) string` (strip `[…]`/`(…)` noise tags, collapse whitespace).
- `type Jobs struct{…}`; `func NewJobs(t Transcriber, c Composer, publish func(userID int64, job api.AiJob), timeout time.Duration, now func() time.Time) *Jobs`; `func (j *Jobs) Start(userID int64, audio []byte, in ComposeInput) (jobID string)`; `Get(userID int64, id string) (api.AiJob, bool)`; `Cancel(userID int64, id string) bool`; janitor removes finished jobs after 15 min. Status transitions publish each step. Empty cleaned transcript → `failed`, error `emptyTranscript`. Upstream errors → `failed`, `transcriptionFailed` / `compositionFailed`; mood outside 0..4 → nil.
- `AiService` implementing generated `api.AiService`: 404 `aiDisabled` when not configured; enforces `MaxAudioBytes` → 413 `audioTooLarge` (`http.MaxBytesReader` in a hand-written wrapper if the generated multipart decoder reads first — check generated code); `kind` validation.

- [ ] **Step 1: Failing tests** with `httptest` fake whisper/ollama: `TestWhisperRequestShape`, `TestOllamaRequestShapeAndThinkFlag`, `TestOllamaParsesResult`, `TestCleanTranscript` (`"[Musik] hallo  welt (Applaus)"` → `"hallo welt"`), `TestJobHappyPathPublishesSteps` (queued→transcribing→composing→done), `TestJobEmptyTranscript`, `TestJobCancel` (context reaches fake server), `TestJobOwnership` (other user Get → not found), `TestJobExpiry`, `TestCreateJobTooLarge`, `TestCreateJobAIDisabled404`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(server): whisper/ollama clients and in-memory AI jobs`.

### Task 12: Web serving, wiring, server integration

**Files:** Create `server/internal/web/static.go` + test, `server/internal/web/dist/index.html` (placeholder), modify `server/cmd/maschnotes/main.go`; create `server/cmd/legacyfixture/main.go`.

**Interfaces:**

- `func NewSPA(dist fs.FS, basePath string) http.Handler` — serves files; unknown non-`/api` paths → `index.html`; rewrites `<base href="…">` to the effective base path and, for `manifest.webmanifest`, `scope`/`start_url`; effective base = `BASE_PATH` or matched `X-Forwarded-Path` prefix (strip it from the request path like the old middleware). Long cache for `assets/*`, `no-cache` for `index.html`.
- `main.go`: load config, ensure data dir, JWT key (env or `DATA_DIR/jwt.key`, 64 random bytes, 0600), open + migrate DB, build services, `mux := http.NewServeMux()`; register generated routes with `api.WithMiddleware(authMiddleware)` + `api.WithErrorHandler(service.WriteError)`; `/api/ws`; SPA on `/`; wrap all in base-path stripping; graceful shutdown on SIGINT/SIGTERM; `slog` JSON logs.
- `legacyfixture -db <path> -user legacy -password legacy-pass -entries 30`: inserts a user with `NewLegacyHash`, settings −1 params, a diary with N entries (half `yyyy-MM-dd HH:mm:ss` dates, half `o` format, one duplicate date, one regular notebook entry with category) encrypted with the legacy scheme (Go AES-CBC), and ratings.

- [ ] **Step 1: Failing tests** `TestSPAFallbackAndBaseHref` (`BASE_PATH=/MaSchNotes` → `<base href="/MaSchNotes/">`), `TestSPAForwardedPath` (`X-Forwarded-Path: MaSchNotes`, request `/MaSchNotes/diary` → index with base `/MaSchNotes/`), `TestManifestRewrite`, `TestAPINotFoundNotSPA` (`/api/nope` → 404 JSON).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Verify on prod copy:** copy the production DB copy to scratch `data/`, run `go -C server run ./cmd/legacyfixture -db <copy>` then `DATA_DIR=<scratch>/data PORT=8080 go -C server run ./cmd/maschnotes`; `curl localhost:8080/api/config` → JSON; `curl -X POST …/api/auth/prelogin -d '{"username":"legacy"}'` → `legacy`; backup file exists. Stop server.
- [ ] **Step 6:** `go -C server tool golangci-lint run` clean. **Commit** `feat(server): SPA serving with base path, wiring, legacy fixture tool`.

### Task 13: Client foundation (theme, i18n, dates, API wrapper, UI primitives, router)

**Files:** Create `client/public/manifest.webmanifest` (name "MaSch Notes", `display: standalone`, theme colours, icons) + copy `apple-icon.png`/`apple-splash.jpg` from `src/MaSchNotes.Client/src/assets/` and add a `favicon.svg` (Lucide `BookHeart` on accent); link them in `index.html` with `<base href="/">`. Create `client/src/index.css` (Tailwind theme), `client/src/lib/{api.ts,dates.ts,errors.ts,base64.ts}`, `client/src/lib/i18n/{index.ts,en.ts,de.ts}`, `client/src/components/ui/*`, `client/src/App.tsx` (routes), tests `dates.test.ts`, `i18n.test.ts`, `base64.test.ts`, `ui/Modal.test.tsx`.

**Interfaces:**

- Theme tokens as CSS variables in `@theme` (light) and overridden in `@media (prefers-color-scheme: dark)`: `--color-bg`, `--color-panel`, `--color-rail`, `--color-text`, `--color-muted`, `--color-line`, `--color-accent` (#0f9d76 / dark #2fc59a), `--color-accent-fg`, `--color-mood-0..4` (#e5484d, #f2994a, #f2c94c, #8bd17c, #27ae60). Custom variants: `@custom-variant medium (@media (min-width: 640px))`, `@custom-variant wide (@media (min-width: 1100px) and (min-height: 640px))`.
- `detectLocale(languages: readonly string[]): 'de' | 'en'`; `I18nProvider`, `useI18n(): { t: Translator<Dict>, locale: 'de'|'en' }`; `en.ts` exports `const en = {…}` and `type Dict = typeof en`; `de.ts` exports `const de: Dict`. Includes `errors.<code>` keys for every server error code used in Tasks 7–11.
- Dates: `toIsoDate(d: Date): string` (local), `parseIsoDate(s: string): Date` (local midnight), `addDays(d, n)`, `startOfWeek(d)` (Monday), `monthGrid(year, month): Date[][]` (6 rows × 7, Monday first), `formatLong(d, locale)` (weekday + day + month + year via `Intl.DateTimeFormat`).
- `base64.ts`: `toBase64(bytes: Uint8Array): string`, `fromBase64(s: string): Uint8Array`.
- `api.ts`: `createApi(getToken: () => string | null, onUnauthorized: () => void)` returning instances of every generated client configured with base URL `new URL('api', document.baseURI)` and the bearer header; `apiError(e: unknown): { code: string; status?: number }`.
- UI primitives (Tailwind, keyboard accessible, focus-trapping Modal, Popover anchored to a ref with flip on viewport edge): `Button` (variants primary/ghost/danger, `loading`), `TextField` (label, error), `Modal`, `Popover`, `Spinner`, `Toast` (`showToast(msg, kind)`).
- Routes (`@solidjs/router`, hash-free, base from `document.baseURI` path): `/login`, `/register`, `/` (HomeRedirect → first diary or notebooks), `/diary/:notebookId/:date?`, `/notebook/:notebookId/:entryId?`, `/settings`; unauthenticated → `/login`.

- [ ] **Step 1: Failing tests:** `toIsoDate uses local calendar day` (run with `process.env.TZ = 'Europe/Berlin'` set in `vitest.config.ts` `env`; `new Date(2026, 9, 18, 0, 30)` → `'2026-10-18'`), `monthGrid starts Monday and has 6 weeks` (Oct 2026 first cell = 2026-09-28), `detectLocale` (`['de-AT','en']`→de, `['en-US','de']`→en, `[]`→en), `de dictionary covers all en keys` (runtime deep key comparison), `base64 round trip`, `Modal traps focus and closes on Escape`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** `pnpm --filter client lint && pnpm --filter client typecheck`. **Commit** `feat(client): theme, i18n, dates, api wrapper, ui primitives, routes`.

### Task 14: Client crypto (legacy, v2, key store)

**Files:** Create `client/src/lib/crypto/{legacy.ts,v2.ts,key-store.ts}` + `legacy.test.ts`, `v2.test.ts`, `key-store.test.ts`; read vectors from `server/internal/auth/testdata/vectors.json` (written in Task 5).

**Interfaces:**

- legacy: `deriveLegacyEncryptPass(username: string, password: string): Promise<string>`, `deriveLegacyKey(encryptPass: string, saltB64: string): Promise<CryptoKey>`, `decryptLegacy(key: CryptoKey, contentB64: string): Promise<string>` (AES-CBC, IV UTF-8 `d6c6b426090a5ae9`).
- v2: `randomSalt(): Uint8Array` (16), `deriveKeys(password: string, salt: Uint8Array, iterations: number): Promise<{ authKey: string /*b64*/; wrapKey: CryptoKey }>`, `generateDataKey(): Promise<CryptoKey>` (extractable only for wrapping), `wrapDataKey(wrapKey, dataKey): Promise<string>`, `unwrapDataKey(wrapKey, wrappedB64): Promise<CryptoKey>` (non-extractable, usages encrypt/decrypt), `encryptContent(dataKey, text): Promise<string>`, `decryptContent(dataKey, b64): Promise<string>`. `KDF_ITERATIONS = 600_000`.
- key-store (IndexedDB db `maschnotes`, store `keys`, record `{ id: 'data', key: CryptoKey, expiresAt: number }`): `saveDataKey(key, expiresAt: Date)`, `loadDataKey(): Promise<CryptoKey | null>` (deletes + returns null when expired), `clearDataKey()`.

- [ ] **Step 1: Failing tests** (`// @vitest-environment node` for crypto files; key-store uses `fake-indexeddb` dev dep): `legacy matches .NET vectors` (encrypt pass + key bytes via a test-only raw export), `legacy decrypts crypto-js ciphertext` (encrypt `"Hallo Welt äöü 😀"` with crypto-js using the vector key + IV, decrypt with `decryptLegacy`), `v2 content round trip with unique IVs` (same text twice → different ciphertext), `v2 wrap/unwrap round trip`, `v2 wrong password fails unwrap`, `deriveKeys deterministic for same salt`, `key-store expires keys`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): legacy and v2 WebCrypto encryption, IndexedDB key store`.

### Task 15: Session, login and register

**Files:** Create `client/src/lib/session.ts` + test, `client/src/pages/{LoginPage.tsx,RegisterPage.tsx}` + `LoginPage.test.tsx`.

**Interfaces:**

- `createSession()` store exported as `session`: `state: { token, user, expiresAt, dataKey: CryptoKey | null, migration: MigrationInfo | null, legacyKeys: CryptoKey[] }`; `login(username, password, stayLoggedIn): Promise<'ok' | 'migrate'>` (prelogin → v2 path or legacy path; legacy path derives `legacyKeys` = [key from typed username, key from `user.username` if it differs] when `legacySalt` present); `register(input)`; `restore(): Promise<boolean>` (token from localStorage + `checkToken` + `loadDataKey`; missing key → logout); `logout()` (clears localStorage token, `clearDataKey`); `changePassword(old, next): Promise<void>` (prelogin for salt/iterations, derive old authKey, new salt, rewrap current dataKey).
- Login page: username, password, "stay logged in", error text from `errors.invalidCredentials`; link to register only if `config.registrationEnabled`. Register page: given name, surname, email, username, password + confirm; warns that a forgotten password means losing all texts.

- [ ] **Step 1: Failing tests** with a mocked API: `login v2 stores data key`, `login legacy returns migrate with two legacy keys when casing differs`, `restore logs out when key missing`, `changePassword rewraps same data key` (decrypt old ciphertext with key unwrapped by new password), `LoginPage shows error on 401`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): session handling with v2 login, legacy detection, register`.

### Task 16: Migration runner and modal

**Files:** Create `client/src/lib/migration.ts` + test, `client/src/pages/MigrationModal.tsx` + test.

**Interfaces:**

- `runMigration(opts: { api: Api; password: string; legacyKeys: CryptoKey[]; signal?: AbortSignal; onProgress(p: { done: number; total: number }): void }): Promise<{ status: 'done' } | { status: 'failed'; entries: PendingEntry[] }>` — start (or resume: derive wrap key from returned salt and unwrap returned key), loop `listPendingEntries(50)`: decrypt with each legacy key in order until one succeeds (padding/UTF-8 error = failure, also reject output containing U+FFFD), encrypt v2, upload batch; collect failures and continue past them (exclude failed ids from the next page request by skipping them client-side; stop when a page contains only already-failed ids); if failures → return `failed`; else `completeMigration`, `saveDataKey`, return `done`.
- `skipAndComplete(api, ids)`.
- Modal (blocking, cannot be dismissed): explanation text, progress bar `done/total`, "you can close the tab, progress is kept" hint, failure list (notebook name + date/title) with "Skip these entries" (confirm dialog) and "Log out".
- The password is needed again on resume → after a reload during migration, `restore()` sees status `migrating` without key → modal asks for the password first.

- [ ] **Step 1: Failing tests** with an in-memory fake API holding legacy ciphertext produced by crypto-js: `migrates all entries and completes`, `resumes with same data key after abort` (abort after first batch, rerun → completes, every entry decrypts with final key), `retries legacy key with stored account name` (entries encrypted with key of `TestUser`, typed `testuser` → done), `reports undecryptable entries and does not complete`, `MigrationModal shows progress and failure list`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): resumable legacy migration runner and modal`.

### Task 17: App shell and notebook management

**Files:** Create `client/src/components/layout/{AppShell.tsx,Sidebar.tsx,IconRail.tsx,BottomTabs.tsx}`, `client/src/components/NotebookDialog.tsx`, `client/src/pages/HomeRedirect.tsx` + `AppShell.test.tsx`; `client/src/lib/notebooks.ts` (resource: `notebooks()`, `createNotebook`, `renameNotebook`, `deleteNotebook`).

Layout per spec §10 and `mockups/diary-layouts.html`: wide → Sidebar with "Diaries"/"Notebooks" groups (`BookHeart` / `NotebookText` icons), "New notebook" (`Plus`), Settings (`Settings`) bottom; medium → IconRail; phone → BottomTabs (Diary · Notes · Settings) with the diary/notebook picker in the page header. NotebookDialog: name + "is diary" toggle (create), rename, delete with typed-name confirmation.

- [ ] **Step 1: Failing tests** `groups notebooks into diaries and notebooks`, `create notebook adds it to the sidebar and navigates`, `delete requires confirmation`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): responsive app shell and notebook management`.

### Task 18: Diary view

**Files:** Create `client/src/components/{MoodPicker.tsx,MonthCalendar.tsx,WeekStrip.tsx,EntryEditor.tsx}`, `client/src/pages/DiaryPage.tsx`, `client/src/lib/entries.ts` (decrypt/encrypt + save queue) + tests `entries.test.ts`, `DiaryPage.test.tsx`, `MonthCalendar.test.tsx`.

**Interfaces:**

- `createEntrySaver(opts: { save(content: string): Promise<void>; debounceMs: number })` → `{ change(text), flush(): Promise<void>, status: Accessor<'idle'|'saving'|'saved'|'error'> }`.
- `MonthCalendar(props: { month: Date; selected: string; ratings: Map<string, number>; entryDays: Set<string>; onSelect(date: string); onMonthChange(d: Date) })`; `WeekStrip` same data for the selected week; `MoodPicker(props: { value: number | null; onChange(v: number | null) })` (Lucide `Angry, Frown, Meh, Smile, Laugh`, coloured with mood tokens; clicking the current value clears it); `EntryEditor(props: { value; onInput; placeholder; readOnly? })` auto-growing textarea, `max-w-[70ch]`.
- DiaryPage: route `/diary/:notebookId/:date?` (default today); loads ratings for visible month and entry dates (`listEntries(from,to,includeContent=false)`); loads the selected day's entries with content and decrypts (encVersion 2 → data key; encVersion 1 shouldn't occur after migration → show "cannot decrypt" placeholder); shows stacked editors if several; empty day → editor that creates on first non-empty save (409 → reload and update); delete entry with confirm; "Saved · encrypted" status with `Lock` icon. Wide: calendar left of editor; medium/phone: WeekStrip + month popover button (`CalendarDays`).

- [ ] **Step 1: Failing tests** `saver debounces and flushes`, `flushes pending save to previous day on navigation`, `create conflict switches to update`, `calendar colours days by rating and marks entry days`, `mood click sets and second click clears`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Visual check:** `pnpm dev` + Go server on a migrated fixture DB; check the three layouts at 1280×800, 900×700, 1280×600 and 390×844 in the browser pane against `mockups/diary-layouts.html`, both colour schemes. Fix discrepancies.
- [ ] **Step 6: Commit** `feat(client): calendar-first diary view with autosave`.

### Task 19: Regular notebook view

**Files:** Create `client/src/pages/NotebookPage.tsx` + test.

Searchable title list grouped by category (`localeCompare`, "Uncategorised"/"Ohne Kategorie" last), "+" new entry, editor with title, category input with `<datalist>` from `listCategories`, content editor, delete, autosave via `createEntrySaver`; phone: list → editor with back button. Route `/notebook/:notebookId/:entryId?`.

- [ ] **Step 1: Failing tests** `groups entries by category with uncategorised last`, `search filters titles`, `new entry requires title before first save` (shows validation, doesn't call API).
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): regular notebook view`.

### Task 20: Settings

**Files:** Create `client/src/pages/SettingsPage.tsx` + test.

Sections: Profile (given name, surname, email → `updateUser`), Change password (old, new, confirm; warning about unrecoverable texts; uses `session.changePassword`), API keys (list, create with name → key shown once in a Modal with copy button, delete with confirm), Log out.

- [ ] **Step 1: Failing tests** `change password validates confirmation`, `created api key is shown once`, `wrong old password shows translated error`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): settings with profile, password change and api keys`.

### Task 21: Recording and AI jobs in the client

**Files:** Create `client/src/lib/audio/{recorder.ts,wav.ts}`, `client/src/lib/{ws.ts,ai-jobs.ts}`, `client/src/components/{RecordButton.tsx,RecordPopover.tsx}` + tests `wav.test.ts`, `ws.test.ts`, `ai-jobs.test.ts`, `RecordPopover.test.tsx`; wire into `DiaryPage` and `NotebookPage` (only when `config.aiEnabled`).

**Interfaces:**

- `encodeWav(samples: Float32Array, sampleRate: number): Blob` (PCM16 mono, 44-byte header); `toWhisperWav(blob: Blob): Promise<Blob>` (`decodeAudioData` → `OfflineAudioContext(1, ceil(duration*16000), 16000)` render → `encodeWav`).
- `createRecorder(): { start(): Promise<void>; stop(): Promise<Blob>; cancel(): void; elapsedMs: Accessor<number>; recording: Accessor<boolean> }` (MediaRecorder, `audio/webm;codecs=opus` else `audio/mp4`).
- `createWsClient(opts: { url: string; getToken(): string | null }): { subscribe(fn: (m: WsServerMessage) => void): () => void; close(): void }` — connects lazily, sends auth, reconnects with backoff (1 s → 30 s).
- `startAiJob(api, ws, input: { audio: Blob; kind: 'diary'|'notebook'; date?: string; title?: string }): { status: Accessor<AiJobStatus>; result: Promise<AiResult>; cancel(): void }` — upload → subscribe to `aiJob` messages for its id, also `getAiJob` once after (re)connect; persists `{jobId, route}` in `sessionStorage` key `maschnotes.aiJob` and `resumePendingJob()` on page load.
- RecordPopover (anchored to RecordButton): steps Recording ✓ → Transcribing → Writing entry with `Loader2` spinner / `Check` / `X`; privacy note (spec §9 text, translated); Cancel; on failure "Retry" (re-uploads kept audio). On done: page appends `"\n\n" + text` (no separator if empty), saves, sets mood if day has none (diary), sets title if empty (notebook).

- [ ] **Step 1: Failing tests** `encodeWav header and length` (1 s @16 kHz → 32044 bytes, `RIFF`/`WAVE`/`fmt `/`data` markers, sample rate field 16000), `ws client authenticates then delivers messages and reconnects` (mock WebSocket), `ai job resolves on done message`, `ai job falls back to getAiJob after reconnect`, `popover shows steps and privacy note`, `append sets mood only when day has none`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(client): voice recording with AI job progress popover`.

### Task 22: Prompt tuning against the real recording

**Files:** Create `server/cmd/aiprompttest/main.go`; modify `server/internal/ai/prompt.txt`.

- `aiprompttest -audio <file> -whisper <url> -llm <url> -model <m> [-think] [-kind diary] [-date 2026-10-18]` runs `Transcriber` + `Composer` with the real clients (whisper accepts the mp3 directly — verified) and prints transcript, entry text, mood, timings.

- [ ] **Step 1:** Run `go -C server run ./cmd/aiprompttest -audio <recording> -whisper <whisper url> -llm <ollama url> -model gemma4:12b`.
- [ ] **Step 2:** Judge the output against spec §9 (same language — German here; no invented facts: compare each sentence against the transcript; paragraphs at time jumps; fillers removed; mood plausible). Adjust `prompt.txt`, rerun; at least 3 runs of the final prompt for stability. Also compare `-think` once and note speed/quality.
- [ ] **Step 3:** Save the final transcript + entry + mood into the PR description draft (not into the repo — it's Marc's private diary text).
- [ ] **Step 4: Commit** `feat(ai): tuned diary prompt and prompt test tool`.

### Task 23: Docker, scripts, README, end-to-end verification, remove old code

**Files:** Create `/Dockerfile`, `/.dockerignore`, `/scripts/docker.ps1`, finish `/README.md`; delete `/src/`, `/MaSchNotes.sln`, `/build/`.

- Dockerfile: stage `client` (`node:24-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm --filter client build`), stage `server` (`golang:1.27-alpine`, copy `client/dist` → `server/internal/web/dist`, `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"`, cross-compiled via `TARGETOS`/`TARGETARCH` on `--platform=$BUILDPLATFORM`), final `alpine:3` (runs as root like the old image so port 80 and existing `/data` permissions keep working) with `tzdata`, `ca-certificates`, `EXPOSE 80`, `VOLUME /data`, `ENV DATA_DIR=/data`.
- `scripts/docker.ps1 -Push`: registry from `-Registry` / `DOCKER_REGISTRY`; `docker buildx build --platform linux/amd64,linux/arm64 -t $registry/masch-notes:latest [--push]`. Root scripts `docker:build`, `docker:push`.
- README: dev setup, scripts, env vars table (copy from spec §6), dependency-age policy, encryption overview, migration notes for Marc (backup file, first-login migration).

- [ ] **Step 1:** `docker build -t masch-notes:test .` → success; run with a **copy** of the prod DB mounted at `/data` plus the legacy fixture and AI env vars pointing to the test servers.
- [ ] **Step 2: E2E in the browser pane** (localhost): log in as fixture user `legacy` → migration modal → close tab mid-way → reopen, enter password → completes; entries readable; change password; log out/in with new password; register a new user; diary layouts at the four sizes; record a short clip (or upload path via devtools) → popover steps → text appended, mood set; German UI via `navigator.languages` emulation (Accept-Language / `--lang=de`).
- [ ] **Step 3:** `pnpm generate:check && pnpm lint && pnpm format:check && pnpm test && go -C server test ./... && go -C server tool golangci-lint run` → all clean.
- [ ] **Step 4:** Delete old code; `git grep -n "MaSchNotes.Server\|MaSchNotes.Client"` → only README history notes. **Commit** `chore: docker build, docs, remove legacy ASP.NET/Angular code`.
