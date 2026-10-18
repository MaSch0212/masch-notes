# MaSch Notes

MaSch Notes is a self-hosted personal notebook and diary. It runs as a single Go binary with an embedded web client and stores everything in one SQLite file.

## Features

- Notebooks and diaries, with one entry per day in diaries
- Mood calendar: rate each day from awful to great
- Client-side encryption: entry content is encrypted in the browser, and the server never sees your password or keys
- Password change without losing entries
- AI voice entries: record or upload audio, transcribe it with whisper.cpp and turn it into a diary text with a local LLM (Ollama)
- German and English UI

## Repository layout

| Path                   | Contents                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ |
| `api/openapi.yaml`     | OpenAPI 3.1 spec, the single source of truth for the API                       |
| `tools/codegen/`       | Code generator (`@goast/core`, `@goast/go`, `@goast/typescript`)               |
| `server/`              | Go module. `cmd/maschnotes` is the entry point, `internal/` the server code    |
| `server/internal/api/` | Generated Go models and handlers (do not edit)                                 |
| `client/`              | SolidJS + Vite web client                                                      |
| `client/src/api/`      | Generated TypeScript models and fetch clients (do not edit)                    |
| `Dockerfile`           | Multi-stage build: client, then static server binary, then small runtime image |
| `scripts/docker.ps1`   | Docker build and push helper                                                   |
| `docs/goast-notes.md`  | Issues found in the goast generators and how this repo works around them       |

Generated code is committed, so the Go server builds without Node. Run `pnpm generate` after changing `api/openapi.yaml`.

## Requirements

- Node.js 24
- pnpm 12
- Go 1.27

## Development setup

```sh
pnpm install
pnpm generate                              # only needed after API changes
PORT=8080 DATA_DIR=./data go -C server run ./cmd/maschnotes
pnpm dev                                   # Vite on http://localhost:5173, proxies /api to :8080
```

## Scripts

| Script           | Command                                                       |
| ---------------- | ------------------------------------------------------------- |
| `generate`       | `pnpm --filter codegen start`                                 |
| `generate:check` | Regenerates and fails if the committed generated code changed |
| `dev`            | `pnpm --filter client dev`                                    |
| `build`          | `pnpm --filter client build`                                  |
| `test`           | `pnpm --filter client test`                                   |
| `lint`           | `pnpm --filter client lint`                                   |
| `format`         | `oxfmt .`                                                     |
| `format:check`   | `oxfmt --check .`                                             |
| `typecheck`      | `pnpm --filter client typecheck`                              |
| `go:test`        | `go -C server test ./...`                                     |
| `go:lint`        | `go -C server tool golangci-lint run`                         |
| `go:fmt`         | `go -C server tool golangci-lint fmt`                         |
| `docker:build`   | `pwsh -File scripts/docker.ps1`                               |
| `docker:push`    | `pwsh -File scripts/docker.ps1 -Push`                         |

## Configuration

Set these as environment variables.

| Var                   | Default                                  | Meaning                                                                    |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `PORT`                | `80`                                     | listen port                                                                |
| `DATA_DIR`            | `/data` in container, `./data` otherwise | DB location (`maschnotes.db`)                                              |
| `JWT_KEY`             | —                                        | HMAC secret. If unset, generate one and persist it in `DATA_DIR/jwt.key`.  |
| `BASE_PATH`           | ``                                       | optional path prefix                                                       |
| `ALLOW_REGISTRATION`  | `true`                                   | registration was open in the old app                                       |
| `AI_WHISPER_URL`      | —                                        | whisper.cpp server base URL (e.g. `https://whisper.example.com`)           |
| `AI_WHISPER_LANGUAGE` | `auto`                                   | passed to whisper                                                          |
| `AI_LLM_URL`          | —                                        | Ollama base URL (e.g. `https://ollama.example.com`)                           |
| `AI_LLM_MODEL`        | —                                        | e.g. `gemma4:12b`                                                          |
| `AI_LLM_THINK`        | `false`                                  | Ollama `think` flag                                                        |
| `AI_LLM_PROMPT_FILE`  | —                                        | optional override of the built-in system prompt                            |
| `AI_MAX_AUDIO_MB`     | `50`                                     | upload limit                                                               |
| `AI_TIMEOUT`          | `10m`                                    | per-step timeout for whisper / LLM calls                                   |

AI is enabled only when `AI_WHISPER_URL`, `AI_LLM_URL` and `AI_LLM_MODEL` are all set.
Old names stay accepted as aliases: `path-base` / `PathBase` → `BASE_PATH`; `JWT__key` /
`JWT:key` → `JWT_KEY`; `DOTNET_RUNNING_IN_CONTAINER=true` still selects `/data`.

## Encryption

- Each user has a random data key (AES-256-GCM). The server stores it only wrapped.
- The wrapping key is derived in the browser from the password with PBKDF2-SHA256 (600 000 iterations) and HKDF. Login sends a separate auth key, not the password, and the server stores only an Argon2id hash of it.
- Entry content is encrypted in the browser with the data key before it is sent. The server stores ciphertext only.
- The unwrapped data key is kept as a non-extractable key in IndexedDB and removed on logout or when the session expires.
- Forgetting your password means your entries are lost, because no one else can unwrap the data key.
- The legacy scheme (PBKDF2-SHA1 and AES-CBC from the old app) exists only to read and migrate old entries.

## Upgrading from the ASP.NET version

- Point the container at the same `/data` volume as the old app.
- Before the first schema migration, the server copies the database to `maschnotes.db.bak-<timestamp>`. Keep this file until you are satisfied.
- Each existing user re-encrypts their entries in the browser on first login. A modal shows the progress. Closing the tab is safe, and the migration resumes on the next login.
- Old login tokens are invalid, so users log in again once.

## Dependency-age policy

New releases are only used after they have been public for two days.

- pnpm: `minimumReleaseAge: 2880` (minutes) in `pnpm-workspace.yaml`. The `@goast/*` packages are excluded because they are our own.
- Go has no equivalent setting. `renovate.json` applies `minimumReleaseAge: "2 days"` to the `npm` and `gomod` managers instead.

## Docker

```sh
pnpm docker:build   # single-platform image, loaded into the local Docker daemon
pnpm docker:push    # linux/amd64 + linux/arm64, pushed to the registry
```

The script uses `marc-nas:4000` if that host resolves, otherwise `docker.masch212.de`. The image listens on port 80, stores data in `/data` (`VOLUME /data`) and runs as root.
