# Scaffold map — file tree & screen → route → component

The suggested project structure for the real build, and a mapping from each prototype screen
to the route + component files that implement it. Follow this so the build stays organized and
every screen in `prototypes/Bjur Portal.dc.html` is traceable to real code.

Stack: Next.js (App Router) + Prisma + SQLite + a standalone worker. See `ARCHITECTURE.md`.

---

## Project tree

```
bjur-portal/
├─ docker-compose.yml
├─ Dockerfile                     # node + ffmpeg + handbrake-cli
├─ package.json
├─ next.config.js                 # output: 'standalone'
├─ middleware.ts                  # session resolve + portal scope gating (client vs /admin)
├─ .env                           # DATABASE_URL, MEDIA_ROOT, DERIVED_ROOT, SESSION_SECRET, SLACK_*
│
├─ prisma/
│  ├─ schema.prisma               # the data model (ARCHITECTURE.md §1)
│  └─ seed.ts                     # ports the prototype's clients/projects/assets arrays
│
├─ worker.js                      # ffmpeg proxy/thumbnail loop (ARCHITECTURE.md §5, ENCODING.md)
│
├─ src/
│  ├─ lib/
│  │  ├─ db.ts                    # Prisma client singleton
│  │  ├─ auth.ts                  # argon2 hash/verify, session create/verify/revoke
│  │  ├─ media.ts                 # relPath resolve + traversal guard + range streaming helper
│  │  ├─ licensing.ts             # licenseTiers(basePrice) → 3 tiers (SOCIAL/COMMERCIAL/BUYOUT)
│  │  ├─ slack.ts                 # channel resolution + event posters (SLACK.md)
│  │  └─ authz.ts                 # role/visibility/expiry/license checks for media routes
│  │
│  ├─ components/                 # shared UI (design tokens from README → globals.css / theme)
│  │  ├─ ui/                      # Button, Tag, Field, Input, Toggle, Dialog, Toast, SearchBox
│  │  ├─ Header.tsx               # sticky brand header (client + admin variants)
│  │  ├─ AssetTile.tsx            # still/video/master tile w/ select, favorite, watermark, lock
│  │  ├─ ProjectCard.tsx
│  │  └─ Lightbox.tsx / VideoPlayer.tsx
│  │
│  ├─ app/
│  │  ├─ globals.css              # dark-inverted Modernist tokens (README → Design tokens)
│  │  ├─ layout.tsx
│  │  │
│  │  ├─ (client)/                # CLIENT PORTAL — requires User.clientId
│  │  │  ├─ login/page.tsx
│  │  │  ├─ page.tsx              # project list
│  │  │  ├─ p/[projectId]/page.tsx# project detail (grid, filters, week grouping, licensing)
│  │  │  └─ settings/page.tsx     # profile / security / notifications / sessions
│  │  │
│  │  ├─ admin/                   # STAFF PORTAL — requires User.isAdmin
│  │  │  ├─ login/page.tsx
│  │  │  ├─ page.tsx              # dashboard (stats, worker strip, activity, expiring)
│  │  │  ├─ clients/page.tsx
│  │  │  ├─ projects/page.tsx
│  │  │  ├─ media/page.tsx        # register-from-NAS, proxy queue, internal toggle, BRAW pricing
│  │  │  ├─ library/page.tsx      # cherry-pick archive + auto-map preview
│  │  │  └─ integrations/page.tsx # Slack
│  │  │
│  │  └─ api/
│  │     ├─ auth/login/route.ts   # rate-limited (ARCHITECTURE.md §3)
│  │     ├─ auth/logout/route.ts
│  │     ├─ assets/[id]/thumb/route.ts
│  │     ├─ assets/[id]/proxy/route.ts    # range → 206, streams H.264 proxy
│  │     ├─ assets/[id]/download/route.ts # range, resumable, license-gated master
│  │     ├─ projects/[id]/download-all/route.ts  # streamed zip
│  │     ├─ admin/register/route.ts       # register NAS files → Asset rows (enqueue proxy)
│  │     ├─ admin/library/scan/route.ts   # read archive tree
│  │     ├─ licenses/route.ts             # create License (fires Slack license hook)
│  │     └─ slack/weekly/route.ts         # cron target for the weekly calendar
│  │
│  └─ emails/
│     └─ onboarding.tsx           # from prototypes/Client Onboarding Email.dc.html
│
└─ data/
   └─ bjur.db                     # SQLite (bind-mount volume; NOT in the media tree)
```

---

## Screen → route → component map

| # | Prototype screen (state) | Route | Key files |
|---|---|---|---|
| 1 | Login (`isLogin`, both portals) | `/login`, `/admin/login` | `(client)/login/page.tsx`, `admin/login/page.tsx`, `lib/auth.ts`, `api/auth/login` |
| 2 | Client — project list (`showList`) | `/` | `(client)/page.tsx`, `ProjectCard.tsx`, `Header.tsx` |
| 3 | Client — project detail (`showDetail`) | `/p/[projectId]` | `(client)/p/[projectId]/page.tsx`, `AssetTile.tsx` |
| 4 | Lightbox / video player (`lb`,`vm`) | (client, within detail) | `Lightbox.tsx`, `VideoPlayer.tsx`, `api/assets/[id]/proxy` + `/download` |
| 5 | Licensing dialog (`pay`) | (modal in detail) | `ui/Dialog.tsx`, `lib/licensing.ts`, `api/licenses` |
| 6 | Account settings (`showSettings`) | `/settings` | `(client)/settings/page.tsx`, `lib/auth.ts` (pw change → revoke sessions) |
| 7 | Admin — dashboard (`tabHome`) | `/admin` | `admin/page.tsx` |
| 8 | Admin — clients (`tabClients`) | `/admin/clients` | `admin/clients/page.tsx` |
| 9 | Admin — projects (`tabProjects`) | `/admin/projects` | `admin/projects/page.tsx` |
| 10 | Admin — media (`tabMedia`) | `/admin/media` | `admin/media/page.tsx`, `api/admin/register`, `worker.js` |
| 11 | Admin — library/import (`tabLibrary`) | `/admin/library` | `admin/library/page.tsx`, `api/admin/library/scan` |
| 12 | Admin — Slack (`tabIntegrations`) | `/admin/integrations` | `admin/integrations/page.tsx`, `lib/slack.ts`, `api/slack/weekly` |
| 13 | Onboarding email | (sent on client/seat create) | `emails/onboarding.tsx` |

Global search (admin header) is a component used across all `/admin/*` pages — back it with a
single `GET /api/admin/search?q=` querying clients, projects, and assets.

---

## Suggested build order

1. `prisma/schema.prisma` + `seed.ts` → get real data in.
2. `lib/auth.ts` + `middleware.ts` + login pages → both portals gated.
3. Media routes (`proxy`/`download`/`thumb`) + `AssetTile` → the core client experience.
4. Client project list + detail + settings.
5. Admin dashboard + clients + projects.
6. `worker.js` + admin media/library (register + proxy pipeline).
7. Slack (`lib/slack.ts` + integrations page + weekly cron).
8. Docker + Synology reverse proxy → deploy.
