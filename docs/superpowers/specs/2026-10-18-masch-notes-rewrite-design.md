# MaSch Notes — Rewrite, New Encryption & AI Voice Entries (Design)

Date: 2026-10-18 · Status: draft for approval

## 1. Intent

MaSch Notes is Marc's personal diary/notebook app (ASP.NET 5 + Angular 12, SQLite, client-side
encrypted entry text). The stack is outdated and the UI looks dated. The goal is a full rewrite to
a modern, maintainable stack with a completely new UI that works well on desktop, tablet and phone,
a new key-based encryption scheme that makes password changes possible, and a new optional AI
feature: speak a messy voice note and get a nicely written entry appended.

Marc will point the new Go server at the existing production SQLite file (a copy is at
a local copy of the production DB for testing — never modify the original). Every existing account, notebook,
entry, day rating and API key must keep working. Existing users are moved to the new encryption
scheme by a guided, crash-safe migration on their first login.

## 2. Goals

- Go server (standard library `net/http`, Go 1.22+ routing) replacing the ASP.NET server.
- SolidJS client replacing Angular, with a brand-new calendar-first UI.
- One hand-written OpenAPI 3 spec is the single source of truth. Server interfaces/models
  (`@goast/go`) and the TypeScript fetch client/models (`@goast/typescript`) are generated from it.
- Full compatibility with the existing DB, password hashes and legacy encryption (for reading and
  migrating).
- New encryption: content encrypted with a random per-user data key; only that key is wrapped with
  a password-derived key. Password change = re-wrapping the data key.
- Password change in Settings.
- UI in German and English, picked from the system/browser language (`navigator.languages`; any
  `de*` → German, everything else → English). Dates use the matching locale, weeks start Monday.
- Migration modal for legacy users: re-encrypt all texts client-side; old ciphertext dropped only
  after everything succeeded.
- Optional AI voice entries (record → transcribe → write entry → append), only visible when the
  server is configured for it, processed as server-side jobs with WebSocket status updates.
- Tooling: pnpm (latest, `minimumReleaseAge` 2 days), Node 24, Tailwind CSS 4, oxlint, oxfmt,
  vitest; golangci-lint + gofumpt/goimports for Go.

## 3. Non-goals

- Account recovery for a forgotten password (impossible by design — the data key is only wrapped
  with the password; say so in the UI).
- Rich text / Markdown editing. Content remains plain text (what exists today).
- Reading EF migration tables — there are none; the schema is plain SQL.
- Languages beyond German and English, or a manual language switch.
- Storing audio or transcripts anywhere.
- Encrypting entry titles, categories, notebook names, dates or moods (they are plaintext today and
  stay plaintext; only entry content is encrypted).

## 4. Anti-goals (failure even if it "works")

- Any existing entry that can no longer be decrypted, or any login that stops working.
- A migration that loses or corrupts text if the browser is closed or crashes midway.
- Plaintext entry content reaching the database (AI processing is the only, transient exception;
  §9).
- The record button visible when AI is not configured.
- A UI that just re-skins the old one, or that is cramped on a tablet / short window.

## 5. Repository structure (new)

Build the new structure in place; when complete, delete `src/`, `MaSchNotes.sln` and the old
`build/` scripts.

```
/api/openapi.yaml            hand-written OpenAPI 3.1 spec (single source of truth)
/tools/codegen/              TS script running @goast/core + @goast/go + @goast/typescript
/server/                     Go module (e.g. github.com/MaSch0212/masch-notes/server)
  cmd/maschnotes/main.go
  internal/api/              GENERATED (models + servers) — do not edit
  internal/…                 handwritten: config, db (+ migrations), auth, crypto, notebooks,
                             ratings, settings, ai (jobs), ws, web
  .golangci.yml
/client/                     SolidJS + Vite app
  src/api/                   GENERATED TS models + fetch clients — do not edit
/Dockerfile                  multi-stage: node → client build, go → static binary, small final image
/package.json, pnpm-workspace.yaml, renovate.json
```

- Generated code is committed (so Go builds without Node) and regenerated via `pnpm generate`.
  A check script verifies regeneration produces no diff.
- Root scripts: `generate`, `lint`, `format`, `test`, `build`, `dev` (Go server + Vite with proxy),
  plus `docker:build` / `docker:push` with the registry taken from `-Registry` / `DOCKER_REGISTRY`.
- Docker image keeps the old contract: port 80 inside the container, data dir `/data`, DB file
  `/data/maschnotes.db`. Builds for linux/amd64 and linux/arm64 (pure-Go SQLite, no CGO).

### Dependency-age policy

- pnpm: `minimumReleaseAge: 2880` (minutes = 2 days) in `pnpm-workspace.yaml`; `packageManager`
  pinned to latest pnpm; `engines.node: ">=24"`, `.node-version` = 24.
- Go has no native minimum-release-age setting. Equivalent: `renovate.json` with
  `minimumReleaseAge: "2 days"` for both `npm` and `gomod` managers. Documented in the README.

## 6. Server (Go)

- Standard library HTTP (`net/http` ServeMux, as generated by `@goast/go`); no chi.
- SQLite via `modernc.org/sqlite` (pure Go). `PRAGMA foreign_keys=ON`, WAL mode, single writer.
- JWT via `github.com/golang-jwt/jwt/v5`, HS512. WebSocket via `github.com/coder/websocket`.
  Argon2id via `golang.org/x/crypto/argon2`.
- Serves the built client (embedded via `embed.FS`) and the API under `/api`; SPA fallback to
  `index.html` for unknown non-`/api` paths.
- **Base path**: the app runs behind a reverse proxy under `/MaSchNotes/`. Support `BASE_PATH` and
  the `X-Forwarded-Path` header (as the old server did). The server rewrites `<base href>` in
  `index.html` and `scope`/`start_url` in the web manifest. The client uses relative URLs; the
  WebSocket URL is derived from `document.baseURI`.

### Database & schema migrations

- On startup: create the data dir, open the DB, run the original `CREATE TABLE IF NOT EXISTS`
  script (fresh installs), then apply versioned migrations tracked in `PRAGMA user_version`
  (production is at 0).
- **Before applying any migration to an existing DB, copy the file to
  `maschnotes.db.bak-<timestamp>`** (after a WAL checkpoint).
- Migration 1 (additive only, old data untouched):
  - `userkeys(userid INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    kdfsalt BLOB NOT NULL, kdfiterations INTEGER NOT NULL, wrappedkey BLOB NOT NULL,
    status TEXT NOT NULL /* 'migrating' | 'active' */, updatedat TEXT NOT NULL)`.
  - `notebookentries`: add `encversion INTEGER NOT NULL DEFAULT 1` and `contentv2 BLOB NULL`.
- The real production schema differs cosmetically from `CreateTables.sql` (backtick-quoted
  recreated tables, category uniqueness via a separate unique index). Queries must work with both.

### Configuration (env vars)

| Var                   | Default                                  | Meaning                                                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `PORT`                | `80`                                     | listen port                                                               |
| `DATA_DIR`            | `/data` in container, `./data` otherwise | DB location (`maschnotes.db`)                                             |
| `JWT_KEY`             | —                                        | HMAC secret. If unset, generate one and persist it in `DATA_DIR/jwt.key`. |
| `BASE_PATH`           | ``                                       | optional path prefix                                                      |
| `ALLOW_REGISTRATION`  | `true`                                   | registration was open in the old app                                      |
| `AI_WHISPER_URL`      | —                                        | whisper.cpp server base URL (e.g. `https://whisper.example.com`)          |
| `AI_WHISPER_LANGUAGE` | `auto`                                   | passed to whisper                                                         |
| `AI_LLM_URL`          | —                                        | Ollama base URL (e.g. `https://ollama.example.com`)                          |
| `AI_LLM_MODEL`        | —                                        | e.g. `gemma4:12b`                                                         |
| `AI_LLM_THINK`        | `false`                                  | Ollama `think` flag                                                       |
| `AI_LLM_PROMPT_FILE`  | —                                        | optional override of the built-in system prompt                           |
| `AI_MAX_AUDIO_MB`     | `50`                                     | upload limit                                                              |
| `AI_TIMEOUT`          | `10m`                                    | per-step timeout for whisper / LLM calls                                  |

AI is "enabled" only when `AI_WHISPER_URL`, `AI_LLM_URL` and `AI_LLM_MODEL` are all set.
Old names stay accepted as aliases: `path-base` / `PathBase` → `BASE_PATH`; `JWT__key` /
`JWT:key` → `JWT_KEY`; `DOTNET_RUNNING_IN_CONTAINER=true` still selects `/data`.

### Legacy compatibility rules (must match the old server exactly)

- **Legacy password hashes** in `accounts.password`: `pbkdf2:<iterations>:<b64 salt>:<b64 hash>`,
  PBKDF2-**HMAC-SHA1** (.NET `Rfc2898DeriveBytes` default). Empty stored hash + empty password
  = valid (old quirk; keep for legacy accounts only).
- **Username lookup** is case-insensitive (`COLLATE NOCASE`).
- **Legacy encrypt pass**: `base64(PBKDF2-SHA1(password = <username>, salt = UTF-8(<password>),
  5000, 64 bytes))`. The old app used the username _as typed at login_.
- **Legacy encrypt key**: params from `settings` row `(userid, settingid = -1)`, format
  `pbkdf2:5000:<b64 16-byte salt>:32`. Key = `base64(PBKDF2-SHA1(password = encryptPass string,
  salt, 5000, 32))`.
- **Legacy content**: AES-256-CBC, PKCS7, fixed IV = UTF-8 `d6c6b426090a5ae9`; the BLOB holds the
  raw ciphertext bytes (the API transports them base64). In the new design these derivations happen
  **in the browser** (WebCrypto supports PBKDF2-SHA1 and AES-CBC) — the server only hands out the
  legacy salt. A vitest suite proves byte-identical results against crypto-js / .NET vectors.
- **Dates** are TEXT. Reading accepts `yyyy-MM-dd HH:mm:ss[.fffffff]` (60 entries in prod) and
  `yyyy-MM-ddTHH:mm:ss.fffffff[Z]` (all other entries, all ratings, api keys); `NULL` entry dates
  exist (1 in prod). Writes use `yyyy-MM-ddT00:00:00.0000000` for date-only values so string
  comparisons and `UNIQUE(userid, date)` keep working; API-key timestamps in UTC `o` format.
- **Stored dates are the true calendar days** (verified reasoning: the old month calendar displayed
  ratings at their stored date, so a one-day shift would have been visible for years). No offset.
- **API keys**: 32 random bytes, Base62 (`0-9A-Za-z`), stored plaintext. Auth via `?apikey=<key>`
  on any `/api` route, in addition to `Authorization: Bearer <jwt>`.
- **Categories**: per notebook, upserted on entry create/update; unused ones deleted after entry
  update/delete.
- **Day ratings**: integer 0–4 (0 = awful … 4 = great), per user, one per date.
- Old JWTs need not stay valid.

## 7. New encryption scheme

Designer's call (Marc to confirm): beyond what was asked, the new scheme also stops sending the
raw password to the server, so the server can never derive the key. This is the one moment to do
it cheaply, because every user goes through the migration anyway.

Per user, all in the browser (WebCrypto):

- `kdfSalt` (16 random bytes) and `kdfIterations` (600 000) are stored on the server.
- `masterKey = PBKDF2-SHA256(password, kdfSalt, kdfIterations, 256 bit)`.
- `authKey = HKDF-SHA256(masterKey, info "maschnotes-auth")` → sent to the server instead of the
  password; the server stores `argon2id(authKey)` in `accounts.password` (format
  `argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`).
- `wrapKey = HKDF-SHA256(masterKey, info "maschnotes-wrap")` (AES-GCM key, never leaves the browser).
- `dataKey` = random AES-256-GCM key, generated once per user. Stored on the server only as
  `wrappedKey = AES-GCM(wrapKey, dataKey)` (12-byte IV prefix).
- **Entry content v2**: `AES-256-GCM(dataKey)`, fresh random 12-byte IV per save; BLOB =
  `IV || ciphertext+tag`; `encversion = 2`.
- The unwrapped `dataKey` is kept as a **non-extractable CryptoKey in IndexedDB**, removed on logout
  or when the token expires. Reloads don't need the password again.

Flows:

- **Pre-login** `POST /api/auth/prelogin {username}` → `{ scheme: "v2", kdfSalt, kdfIterations }` or
  `{ scheme: "legacy" }`. Unknown usernames get a deterministic fake v2 answer (HMAC of the
  username with the server secret) so usernames can't be probed.
- **Login v2**: derive keys → `POST /api/auth/login {username, authKey, stayLoggedIn}` → token +
  `wrappedKey` → unwrap → store.
- **Login legacy**: `POST /api/auth/login {username, password, stayLoggedIn}` → token +
  `migration` info (legacy salt, migration state). Client derives the legacy key locally and opens
  the migration modal.
- **Register** (always v2): client generates salt, keys and data key →
  `POST /api/auth/register {username, authKey, kdfSalt, kdfIterations, wrappedKey, user info}`.
- **Password change** (Settings): client derives the old `authKey` and a new salt/master key,
  re-wraps the same `dataKey` → `POST /api/auth/password {oldAuthKey, newAuthKey, kdfSalt,
  kdfIterations, wrappedKey}`; the server verifies and updates hash + key row in one transaction.
  Content is untouched. Other logged-in devices keep working (they hold the same data key).
  Settings states clearly that a forgotten password means the texts are lost.

## 8. Legacy migration (first login of old users)

Blocking modal after a legacy login: what will happen, why, a progress bar
("Re-encrypting 412 / 1010 entries"), "don't close this tab" hint (closing is still safe).

1. Client generates `kdfSalt`, master/auth/wrap keys from the password just entered, and a new
   `dataKey`; `POST /api/crypto/migration/start {kdfSalt, kdfIterations, wrappedKey, authKey}` →
   server writes `userkeys` with `status='migrating'` and remembers the new auth hash **in the
   userkeys row, not in `accounts`** (the legacy password keeps working until the end).
   If a `migrating` row already exists (resume), the server returns it instead; the client derives
   the wrap key with the stored salt and unwraps the stored data key — same data key, no restart.
2. Client pages through all of the user's entries with legacy content and no `contentv2`
   (`GET /api/crypto/migration/pending?limit=50`), decrypts each with the legacy key, re-encrypts
   with the data key and uploads batches (`POST /api/crypto/migration/entries
   [{id, contentv2}]`). Already-migrated entries are skipped on resume.
3. Decryption check: the legacy key is derived from the username as typed; if decrypting fails,
   retry with the stored `accounts.name`. If an entry still can't be decrypted, the migration stops
   and lists the affected entries (date/notebook); nothing is dropped. Marc decides what to do —
   "Skip these entries (keep them in the old format, unreadable)" is offered only as an explicit
   choice.
4. `POST /api/crypto/migration/complete` → in **one transaction** the server checks every legacy
   entry of the user has `contentv2` (or was explicitly skipped), sets `content = contentv2`,
   `contentv2 = NULL`, `encversion = 2`, swaps `accounts.password` to the argon2id hash, sets
   `userkeys.status='active'`, deletes the legacy `settings` row −1.
5. If an entry is edited while `migrating`, the server clears its `contentv2` so it is re-migrated
   (the modal blocks editing anyway).

Users with no entries go through steps 1 and 4 instantly.

## 9. AI voice entries

Shown only when `GET /api/config` reports `aiEnabled`. Available in diary and regular notebooks.

### Job model (avoids HTTP timeouts)

- `POST /api/ai/jobs` (multipart: `audio` WAV, `kind` diary|notebook, optional `date`, `title`)
  → `202 {jobId}` immediately. The server runs the job in a goroutine: transcribe → compose.
- **WebSocket `GET /api/ws`** (one per tab, authenticated by a first `{type:"auth", token}`
  message, ping every 30 s, client auto-reconnects). The server pushes
  `{type:"aiJob", jobId, status: queued|transcribing|composing|done|failed|cancelled,
  result?: {text, mood, title}, error?}`.
- `GET /api/ai/jobs/{id}` returns the same status object (used after reconnect / reload);
  `DELETE /api/ai/jobs/{id}` cancels (context cancellation reaches the whisper/LLM requests).
- Jobs are in memory, owned by the user, and dropped 15 min after finishing or once the result has
  been fetched. Nothing is written to disk.
- The WS message types are declared under `components.schemas` in the OpenAPI file so both sides
  get generated types; the WS client itself is hand-written.

### Flow

1. User taps **Record** → button becomes a stop button with elapsed timer (MediaRecorder).
2. On stop, a **popover anchored to the button** shows: Recording ✓ → (1) Transcribing →
   (2) Writing entry, each with spinner/check, plus the privacy note and Cancel.
3. The client decodes the recording with the Web Audio API and resamples to 16 kHz mono 16-bit WAV
   (what whisper.cpp expects) — no ffmpeg on the server. Then it uploads the job.
4. Transcribe: server posts the WAV to `{AI_WHISPER_URL}/inference` (`response_format=json`,
   `language`).
5. Compose: server calls Ollama `/api/chat` (`stream:false`, `think: AI_LLM_THINK`, `format` = JSON
   schema) → `{ text, mood (0–4 or null), title? }`.
6. On `done`, the client appends `text` to the end of the entry it was started from (blank line
   separator) and saves through the normal encrypt + save path. Diary: if that day has **no mood
   yet** (user-wide rating), set the returned mood. Notebook entry with empty title: fill the
   suggested title. The popover closes; on `failed` it shows the failing step with Retry (re-uses
   the recorded audio held in memory).
7. If the tab is reloaded during a job, the client remembers `{jobId, notebookId, entryId/date}` in
   `sessionStorage`, re-checks the job and still appends the result.

**Privacy note** in the popover (short, honest): "Your recording is sent through your MaSch Notes
server to your own transcription and AI servers, only to create this text. Nothing — audio,
transcript or result — is stored there. The finished text is encrypted in your browser before it
is saved, like every other entry."

**Prompt** (built-in default, overridable by file). Requirements:

- Input is a raw, possibly messy transcript with filler words, false starts, noise artefacts.
- Write a well-formed first-person diary entry (or a note, for `kind: notebook`) in the **same
  language** as the transcript; remove fillers/repetition; fix grammar; keep the speaker's tone.
- Do **not** invent facts, feelings or events; no headings, greeting, summary or commentary.
- **Split into paragraphs whenever there is a time jump** (morning → afternoon, "later",
  "yesterday", …), and otherwise at natural topic changes.
- Extract a **mood** 0–4 (0 awful, 1 bad, 2 okay, 3 good, 4 great) from what is said; `null` if the
  transcript gives no basis.
- Ignore segments that are clearly noise/hallucination (e.g. "[Musik]", "Untertitel …").
- Return JSON only, matching the schema.

**Prompt test**: run the pipeline against a real diary voice recording provided by Marc with
Marc's test servers (whisper.cpp and Ollama, `gemma4:12b`, think=false); iterate until
the entry is clean, faithful, paragraph-split, with a sensible mood. Report transcript → entry to
Marc.

## 10. Client (SolidJS)

- Vite + SolidJS + `@solidjs/router`, TypeScript strict, Tailwind CSS 4, icons from **Lucide**
  (`lucide-solid`). Lint: oxlint; format: oxfmt; tests: vitest (+ @solidjs/testing-library).
- Theme follows `prefers-color-scheme` (light/dark), no manual toggle.
- i18n: `@solid-primitives/i18n` with typed dictionaries (`en` is the source of truth; `de` must
  have every key — enforced by the type checker). All UI text, including the migration modal and the
  AI privacy note, is translated. Server error messages are returned as stable error codes that the
  client translates.
- PWA manifest + icons (reuse existing apple icon/splash).
- Session: JWT in `localStorage` ("stay logged in" → 1-year token, else 2 h); data key in IndexedDB
  (§7).

### Layout — "calendar-first" (approved mockups)

Mockups: `docs/superpowers/specs/mockups/diary-layouts.html` (three diary layouts, Lucide icons —
authoritative) and `mockups/notebook-and-recording.html` (regular notebook view + recording
popover; ignore its emoji icons).

Navigation:

- **Wide (≥ ~1100 px and tall enough)**: left sidebar with groups _Diaries_ and _Notebooks_
  (user-created, dynamic), "+ New notebook", Settings at the bottom.
- **Medium (~640–1100 px, or too short for side-by-side)**: slim icon rail.
- **Phone (< ~640 px)**: bottom tab bar (Diary · Notes · Settings); diary picker in the header.

Diary notebook view:

- Wide: month calendar (cells coloured by mood, dot = has entry, selected day outlined) beside the
  day editor.
- Medium & phone: mood-coloured **week strip** above a full-width entry; a month button opens the
  full month as a popover. Entry text is width-capped (~70ch).
- Day editor: weekday + date heading, 5-step mood picker, plain-text auto-growing editor, autosave
  (debounced + on blur/navigation) with a "Saved · encrypted" status, delete, Record.
- Default selection: today. One entry per diary per day is the intended model; legacy days with
  several entries show them stacked, each with its own editor and Record button.
- Moods are user-wide: every diary shows the same ratings.

Regular notebook view: searchable (title) list grouped by category ("Uncategorised" last) + editor
with title, category (autocomplete), plain-text content, Record. Phone: list → editor.

Other screens: login / register (register hidden if disabled), migration modal (§8), notebook
create/rename/delete, settings (profile; change password; API keys: create → show once with copy,
list, delete; logout).

## 11. Testing

- Go: legacy hash verification against .NET-produced values; argon2id; date parsing of all formats;
  migrations on a copy of the prod schema (and on a fresh DB); repositories; handlers via
  `httptest`; migration start/resume/complete including the transaction checks; AI job lifecycle
  with fake whisper/Ollama servers; WebSocket auth and push.
- Client: vitest for legacy crypto (crypto-js / .NET vectors), v2 key derivation/wrap/unwrap,
  content v2 round trip, migration runner (resume, failure stop), WAV encoder, date helpers, key
  components.
- End-to-end on a **copy** of a local copy of the production DB: server starts, backup file is created,
  migration 1 applies, all row counts unchanged. A synthetic legacy user with known password and
  entries (written in the legacy format) is migrated end-to-end in the browser and stays readable,
  including a simulated mid-migration abort and resume.
- Manual/browser check of the three layouts, the migration modal, password change and the recording
  flow.

## 12. Builder's calls

Exact Tailwind palette (follow the mockup: green accent, mood colours red→green), component
structure, state management, autosave timing, Go package layout inside `internal/`, error response
shape, Dockerfile base image, argon2id parameters (≈ 64 MiB, t=3, p=1), batch sizes.
