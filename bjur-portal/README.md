# Bjur Media — Delivery Portal

A client media-delivery portal: clients log in to view/download proxies and
license BRAW masters for their projects; an admin portal handles clients,
projects, the ingest/proxy pipeline, and integrations (Slack, Instagram/
YouTube view insights). A separate worker process watches an inbox folder,
generates video proxies/thumbnails, and runs the scheduled jobs (weekly
digests, session cleanup).

Architecture/spec docs: [`../design_handoff_bjur_portal/`](../design_handoff_bjur_portal/)
(`ARCHITECTURE.md`, `SCAFFOLD.md`, `ENCODING.md`, `SLACK.md`).

## Local dev setup

```bash
pnpm install
pnpm db:seed      # reseeds SQLite with dev clients/projects/assets
pnpm dev          # Next.js dev server, http://localhost:3000
pnpm worker       # separate terminal — ingest watcher + proxy generation
```

Dev login password for every seeded user is printed by `db:seed`.

### `.env`

| Var | Purpose |
|---|---|
| `DATABASE_URL` | `file:./data/bjur.db` locally |
| `MEDIA_ROOT` / `DERIVED_ROOT` / `INBOX_ROOT` / `ARCHIVE_ROOT` | Media tree paths (canonical delivery tree, generated proxies, drop folder for finished exports, cold storage) |
| `SESSION_SECRET` | Session token signing |
| `CRON_SECRET` | Bearer secret for external-scheduler-triggered routes (`/api/slack/weekly`) |
| `PORTAL_URL` | Used in outbound email links |
| `WORKER_CONCURRENCY` | Parallel proxy-generation jobs (worker only) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Outbound mail (`src/lib/mailer.ts`) — unset in dev, logs instead of sending |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm worker` | Ingest watcher + proxy generation + scheduled jobs, standalone process |
| `pnpm db:seed` | Reseed the dev SQLite DB |
| `pnpm db:studio` | Prisma Studio |
| `pnpm social:sync` | Manually run the weekly Instagram/YouTube sync now instead of waiting for the scheduler |
| `pnpm test:e2e` | Playwright suite (isolated `e2e.db`, reseeded every run — see `e2e/global-setup.ts`) |
| `pnpm test:e2e:ui` | Same, with Playwright's UI runner |
| `pnpm build` / `pnpm lint` | Production build / ESLint |

## Docker layout

Two services, `docker-compose.yml`: `web` (Next.js, `runtime-web` Dockerfile
stage, standalone build) and `worker` (ingest + proxies + schedulers,
`runtime-worker` stage — needs the full `node_modules` since none of its
deps are reachable from Next's route graph for standalone tracing to shrink).
Both mount the same `./data` volume (shared SQLite file — see the WAL/
busy_timeout handling in `src/lib/db.ts`) and the same NAS media share.
`web` listens on host port **3003** (3000–3002 are taken by other sites on
the NAS).

Deploying an update: see [`DEPLOY.md`](./DEPLOY.md).
