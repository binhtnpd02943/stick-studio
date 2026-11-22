# Stick Studio runbook

How to run the backend (API + worker) locally and what to do when it misbehaves. Follow-ups and known gaps: [plan 4 follow-ups](superpowers/plans/2026-11-22-plan-4-followups.md) and [plan 5 follow-ups](superpowers/plans/2026-11-22-plan-5-followups.md).

## Prerequisites
- Node 24 and npm (npm workspaces; run `npm install` once at the repo root).
- ffmpeg and ffprobe on PATH (rendering and mixing).
- `redis-server` on PATH for the server tests (they start a private instance; it is not the compose Redis).
- Docker, for the compose Postgres 16 + Redis 7.

## Infrastructure
```bash
npm run infra:up     # docker compose up -d --wait  (Postgres :5432, Redis :6379, localhost only)
npm run infra:down
```
Dev credentials are `stick`/`stick`. Databases are `stick` and `stick_test`. The init script runs only on a fresh volume.

## Environment
Copy `.env.example` to `.env` and fill it in; never commit `.env`. The variables are documented in that file: `DATABASE_URL`, `REDIS_URL`, `STICK_STORAGE_DIR`, `STICK_CACHE_DIR`, `STICK_WEB_DIR` (optional; `apps/web/dist` makes the API serve the built web app, with unknown non-`/v1` paths falling back to `index.html`, and unset means API only), `HOST`, `PORT`, `STICK_URL_SIGNING_KEY` (at least 32 characters, required for api and dev), `STICK_FAKE`, `ANTHROPIC_API_KEY` and `STICK_LLM_MODEL` (worker and dev unless fake), the budget defaults and `STICK_SEED_PASSWORD`.

`npm run api`, `npm run worker` and `npm run dev` read the process environment only; they do not load `.env`. Export it first, for example `set -a; . ./.env; set +a`. The seed and token scripts do load `.env`.

## Seed a user and a token
```bash
STICK_SEED_PASSWORD='<at least 12 characters>' npm run seed -- --email you@example.com --name "You" [--workspace "Name"]
npm run token -- --email you@example.com --name laptop    # prints an stk_ token once; only its hash is stored
```
The seed creates the workspace, the owner and a channel, with caps of $1 per film and $10 per day. Both scripts use `DATABASE_URL` if set, otherwise PGlite; on PGlite stop `npm run dev` first (PGlite is single-process).

## Running
- One process on PGlite, with no Postgres: `npm run dev` (API and worker together; `STICK_PGLITE_DIR` holds the data).
- Separate processes on Postgres: `npm run api` and `npm run worker`. Both need `DATABASE_URL` (for example `postgres://stick:stick@127.0.0.1:5432/stick`) and `REDIS_URL`. The worker refuses to start without `DATABASE_URL`.
- `STICK_FAKE=1` runs the whole pipeline with fake LLM and TTS: no key, no cost.
- OpenAPI is at `/v1/openapi.json`; `/healthz` and `/readyz` are public.

## Web UI
- Dev: `npm run dev` (API on :3000) and, in a second terminal, `npm run web` (Vite on http://localhost:5173, proxying `/v1` to the API).
- Production: `npm run web:build`, then `export STICK_WEB_DIR=apps/web/dist` and run `npm run dev` or `npm run api`. The API serves the app on its own port.
- Safari keeps no `Secure` cookie on `http://localhost`, so login does not stick there. Use Chrome for local dev, or the Tailscale URL below.

## Phone access
The session cookie is `Secure`, so the browser only keeps it over HTTPS. Reach the API (and the built web app, with `STICK_WEB_DIR` set) through Tailscale:
```bash
tailscale serve --bg 3000      # HTTPS on your tailnet name, forwarding to http://127.0.0.1:3000
```
Then open `https://<machine>.<tailnet>.ts.net` on the phone; `/review` is the phone surface.
The API trusts `X-Forwarded-For` from loopback, which is what `tailscale serve` sends, so the login rate limit is per client. Do not expose the port any other way without revisiting that.

## Tests
```bash
npm test               # all unit and server tests on PGlite (server tests start a private redis-server)
npm run typecheck
npm run test:db:pg     # packages/db against the compose Postgres (STICK_TEST_DATABASE_URL set for you)
npm run test:e2e:pg    # the end-to-end film (API + worker, fake providers) against the compose Postgres
npm run coverage:db    # packages/db coverage, thresholds 80% lines and functions
npm run test:e2e:web   # builds the web app, then Playwright: browser film flow, API contract, axe (fake providers)
```
`test:e2e:web` starts its own server on :4317 (`e2e/serve.ts`: private redis-server, in-memory PGlite, `STICK_FAKE=1`), so port 4317 must be free. It uses Playwright's cached Chromium; set `STICK_E2E_CHANNEL=chrome` to use the installed Google Chrome instead, or run `npx playwright install chromium` once.
`test:db:pg` and `test:e2e:pg` need `npm run infra:up` first.

## Operating notes
- Login fails closed while Redis is down or still starting: the login limiter cannot count, so `POST /v1/auth/login` returns 500 "login temporarily unavailable". Other routes keep working. Wait for Redis (`docker compose ps`), then retry.
- A stuck film: if a worker died mid-step the worker fails the step run once it has been `running` for 30 minutes (checked every minute and at start) with `error: { code: "stale" }`, and fails the film with it. Redo the film as usual; to recover sooner, cancel then redo: `POST /v1/films/:id/cancel`, then `POST /v1/films/:id/redo` with `{ "from_step": "<step>", "reason": "<why>" }`. A redo creates a new version, so the old run cannot overwrite it.
- A film in `blocked_budget`: the film detail's `steps` shows the failed step with `error: { code: "budget", details: { scope, spentUsd, capUsd } }`. Raise the cap (`PATCH /v1/workspace`, 0.01 to 99999 USD) and redo.
- Budget caps: a workspace's `max_cost_per_film_usd` and `max_cost_per_day_usd` apply when set. When they are null, the environment defaults apply: `STICK_MAX_COST_USD` (1) per film and `STICK_MAX_COST_PER_DAY_USD` (10) per UTC day. A film is blocked when spend reaches the cap; a call already in flight can overshoot it.
- A keyless `POST /v1/films` whose enqueue fails returns 500 and leaves the film `failed` (redo it). With an `Idempotency-Key`, the film stays `queued` and the same request, retried, enqueues it.
