# Architecture — Bjur Media Delivery Portal

Build target: **Next.js (App Router) + Prisma + SQLite**, plus a **separate ffmpeg worker
process**, all running in **Docker** on a Synology NAS, behind the Synology reverse proxy.

Design principle: the SQLite DB holds only **metadata and access records**. The actual media
lives on the NAS filesystem and is **never copied into the app** — it is registered in place
and served through authenticated, range-capable routes off a **read-only** mount.

---

## 1. Data model (Prisma schema)

Derived directly from the prototype's state (`clients`, `projects`, `assets`, `sessions`,
`slack`, `clientChannels`, licensing). Drop this into `prisma/schema.prisma`.

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // file:/data/bjur.db
}

generator client {
  provider = "prisma-client-js"
}

// ── Orgs & users ───────────────────────────────────────────
model Client {
  id          String   @id @default(cuid())
  name        String                       // "SSH", "57.NYC", "SUYINSAMA", "Halcyon Films"
  username    String   @unique             // login handle for the org
  type        ClientType @default(RETAINER)
  status      ClientStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  users       User[]
  projects    Project[]
  licenses    License[]
  channel     ClientChannel?
}

enum ClientType   { RETAINER ONEOFF }
enum ClientStatus { ACTIVE DISABLED }

model User {
  id           String   @id @default(cuid())
  clientId     String?                      // null => staff/admin user
  client       Client?  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  name         String
  email        String   @unique
  passwordHash String                       // argon2id
  role         Role     @default(VIEWER)
  isAdmin      Boolean  @default(false)     // staff portal access
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
  sessions     Session[]
  favorites    Favorite[]
  licenses     License[]
}

enum Role { OWNER DOWNLOADER VIEWER }       // client-side seat roles

// ── Projects (galleries) ───────────────────────────────────
model Project {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  title       String
  path        String                        // relative to MEDIA_ROOT: CLIENT/PROJECT/DATE
  status      String   @default("LIVE")
  deliveredAt DateTime?
  expiresAt   DateTime?                     // null => permanent (retainer)
  createdAt   DateTime @default(now())
  assets      Asset[]
  @@index([clientId])
}

// ── Assets (registered files) ──────────────────────────────
model Asset {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind         AssetKind                    // PHOTO | VIDEO
  format       String                       // Still | Reel | Film | Master
  orientation  String                       // landscape | portrait
  name         String                       // display filename
  relPath      String                       // path under MEDIA_ROOT (source of truth on disk)
  sizeBytes    BigInt
  dims         String?                      // "6048×4032"
  durationSec  Int?
  masterCodec  String?                      // "ProRes 422 HQ · 12.4 GB", "BRAW · 47.2 GB"

  // proxy / thumbnail pipeline
  proxyStatus  ProxyStatus @default(PENDING)
  proxyRelPath String?                      // generated H.264 proxy
  thumbRelPath String?                      // generated poster/thumbnail
  proxyRes     String?                      // "1080p H.264", "1080×1920 H.264", "watermarked 1080p"

  // visibility & licensing
  internal     Boolean  @default(false)     // studio working master — hidden from clients
  licensable   Boolean  @default(false)     // BRAW master offered to the client (raw:true)
  basePrice    Int?                         // in whole dollars; tiers derive from this

  // grouping (57.NYC IG workflow)
  weekOf       DateTime?                    // for "group by week"

  createdAt    DateTime @default(now())     // "Added"
  updatedAt    DateTime @updatedAt          // "Updated"
  favorites    Favorite[]
  licenses     License[]
  @@index([projectId])
}

enum AssetKind   { PHOTO VIDEO }
enum ProxyStatus { PENDING GENERATING READY FAILED }

// ── Licensing (BRAW) ───────────────────────────────────────
model License {
  id          String   @id @default(cuid())
  assetId     String
  asset       Asset    @relation(fields: [assetId], references: [id])
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  tier        LicenseTier
  amount      Int                           // dollars charged
  scope       String                        // frozen copy of the scope text
  purchasedAt DateTime @default(now())
  @@index([assetId])
}

enum LicenseTier { SOCIAL COMMERCIAL BUYOUT }

// ── Favorites, sessions, activity ──────────────────────────
model Favorite {
  userId  String
  assetId String
  user    User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  asset   Asset @relation(fields: [assetId], references: [id], onDelete: Cascade)
  @@id([userId, assetId])
}

model Session {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String   @unique               // hash of the session cookie value
  device     String                         // "Chrome · macOS"
  ip         String?
  location   String?                        // resolved from IP
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  @@index([userId])
}

model Activity {
  id        String   @id @default(cuid())
  actor     String                          // "SSH", "You", "Worker", client name
  action    String                          // human-readable line
  meta      String?                         // JSON blob
  createdAt DateTime @default(now())
}

// ── Integrations ───────────────────────────────────────────
model SlackConfig {
  id            Int     @id @default(1)      // singleton row
  connected     Boolean @default(false)
  workspace     String?
  webhookUrl    String?
  defaultChannel String @default("#client-deliveries")
  weeklyDay     String  @default("Monday")
  weeklyTime    String  @default("09:00")
  autoWeekly    Boolean @default(true)
  autoUpload    Boolean @default(true)
  autoDownload  Boolean @default(false)
  autoLicense   Boolean @default(true)
}

model ClientChannel {
  clientId String @id
  client   Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  channel  String                            // "#ssh-deliveries" (empty => use default)
}
```

**Licensing tiers** are computed, not stored as a table — match the prototype's
`licenseTiers(basePrice)`:

| Tier | Amount | Scope |
|---|---|---|
| `SOCIAL` | `round50(base)` | Organic social, web & internal use · 1 year |
| `COMMERCIAL` | `round50(base × 2)` | Paid ads, TV / OTT, out-of-home · 2 years |
| `BUYOUT` | `round50(base × 4)` | All media, worldwide, in perpetuity |

`round50(n) = Math.round(n/50)*50`. Freeze the resolved `amount` + `scope` onto the `License`
row at purchase time so later price changes don't rewrite history.

---

## 2. Path & filesystem model

```
MEDIA_ROOT (read-only mount)  →  /volume1/media/Bjur   on the NAS
DERIVED_ROOT (read-write)     →  /volume1/media/Bjur/_derived   (proxies + thumbs)
```

- Every `Asset.relPath` is **relative to `MEDIA_ROOT`** and follows
  `CLIENT / PROJECT / DATE / FORMAT / file`. This is the canonical organization.
- Registration **never moves or copies** source files; it records `relPath` + metadata.
- Generated proxies/thumbnails are written under `DERIVED_ROOT` (writable), keyed by asset id,
  so the source tree stays untouched and read-only.
- The Library/Import flow reads the raw archive tree, and the **auto-map** step proposes a
  corrected `CLIENT/PROJECT/DATE/FORMAT` destination that the admin confirms before the row is
  created. (It rewrites the *record's* path mapping, not the file on disk unless the admin
  opts to relocate.)

---

## 3. Auth

- **Hashing:** argon2id (`argon2` npm package). Never store plaintext.
- **Sessions:** signed, HTTP-only, `Secure`, `SameSite=Lax` cookie holding a random token;
  store only its hash in `Session.tokenHash`. Middleware resolves the session on every
  request.
- **Two scopes:**
  - Client portal (`/`, `/p/*`, `/settings`) — requires a `User` with a `clientId`.
  - Admin portal (`/admin/*`) — requires `User.isAdmin = true`.
  Enforce in `middleware.ts` by route group; return 404 (not 403) for cross-scope access so
  the admin surface isn't discoverable.
- **Rate limiting:** limit `/api/auth/login` per IP + per username (e.g. 5/min, exponential
  backoff). The login screen advertises "rate-limited".
- **Password change** revokes all *other* sessions for that user (delete `Session` rows ≠
  current). Copy in the UI already promises this.
- **Roles gate actions, not just views:** `VIEWER` cannot hit download/master endpoints;
  `DOWNLOADER`+ can; `OWNER` can additionally manage seats. Uploads/registration are
  admin-only regardless of client role.
- Suggested: NextAuth Credentials provider *or* a small custom handler — custom is fine given
  the closed user set and self-hosted target.

---

## 4. Media serving

All media is served through authenticated API routes off the read-only mount — **no static
file exposure**, no direct NAS paths in the client.

Routes (App Router `route.ts` handlers):

- `GET /api/assets/[id]/thumb` — returns `thumbRelPath`. Cheap, cacheable.
- `GET /api/assets/[id]/proxy` — streams the H.264 proxy. **Must support HTTP Range**
  (`Accept-Ranges: bytes`, honor `Range:`, respond `206 Partial Content` with `Content-Range`)
  so the `<video>` element can scrub and stream.
- `GET /api/assets/[id]/download` — the clean master. **Also range-capable** so downloads are
  **resumable** (the UI promises this). Sets `Content-Disposition: attachment`.

Authorization on every hit, in this order:

1. Valid session.
2. The asset's `project.clientId` matches the user's `clientId` (admins bypass).
3. `asset.internal === false` for client requests (internal assets 404 for clients).
4. Project not expired (`expiresAt == null || expiresAt > now`), else 410 Gone.
5. For `/download` of a **licensable master**: a `License` row must exist for
   `(assetId, clientId)`. Otherwise the client only gets the **watermarked proxy** via
   `/proxy`. `DOWNLOADER`+ role required.

Implementation notes:

- Stream with Node `fs.createReadStream(range)` piped into the Response; never buffer whole
  files (masters are 30–60 GB).
- Validate/normalize `relPath` against `MEDIA_ROOT` (reject `..`, symlink escapes) before
  opening — path-traversal guard.
- Set long `Cache-Control` on thumbs/proxies (content-addressed by asset id + updatedAt),
  `no-store` on master downloads.
- "Download all" zips **proxies or licensed masters** on the fly (streamed zip, e.g.
  `archiver`), honoring the same per-asset gating.

---

## 5. ffmpeg / proxy worker

A **separate long-running process** (own container) that turns registered source files into
streamable proxies + thumbnails. The dashboard shows its status ("ffmpeg worker online",
"Proxies in queue N").

Loop:

1. Poll for `Asset` rows with `proxyStatus IN (PENDING)` (or subscribe to a lightweight
   queue — a DB poll every few seconds is fine at this scale). Mark `GENERATING`.
2. Read the source from the read-only `MEDIA_ROOT`.
3. Generate the H.264 proxy + poster thumbnail per **`ENCODING.md`** (Rec.709, RF 20–22,
   faststart). Reels get a vertical 1080×1920 proxy; films/masters get 1080p.
4. For **BRAW masters** (`licensable`/`raw`), the proxy is **watermarked** ("BJUR MEDIA ·
   PREVIEW" tiled overlay) — this is the preview clients stream before licensing.
5. Write outputs to `DERIVED_ROOT`, set `proxyRelPath` / `thumbRelPath` / `proxyRes`, flip
   `proxyStatus = READY`. On failure set `FAILED` + log an `Activity` row.
6. Emit the `worker`/`upload` Slack event if enabled (see `SLACK.md`).

Concurrency: 1 process by default (matches prototype: "1 process") — masters are huge and the
NAS CPU is the bottleneck. Make it an env var.

---

## 6. Docker & reverse proxy (Synology)

Two services + the DB volume. `docker-compose.yml`:

```yaml
services:
  web:
    build: .
    command: node server.js            # next start (standalone output)
    environment:
      - DATABASE_URL=file:/data/bjur.db
      - MEDIA_ROOT=/media
      - DERIVED_ROOT=/media/_derived
      - SESSION_SECRET=${SESSION_SECRET}
    volumes:
      - ./data:/data                    # SQLite (read-write)
      - /volume1/media/Bjur:/media:ro   # NAS media — READ ONLY
      - /volume1/media/Bjur/_derived:/media/_derived  # derived — read-write
    ports:
      - "3000:3000"
    restart: unless-stopped

  worker:
    build: .
    command: node worker.js            # the ffmpeg loop
    environment:
      - DATABASE_URL=file:/data/bjur.db
      - MEDIA_ROOT=/media
      - DERIVED_ROOT=/media/_derived
      - WORKER_CONCURRENCY=1
    volumes:
      - ./data:/data
      - /volume1/media/Bjur:/media:ro
      - /volume1/media/Bjur/_derived:/media/_derived
    restart: unless-stopped
```

- Base image must include **ffmpeg + HandBrakeCLI** (e.g. `FROM node:20-bookworm` then
  `apt-get install -y ffmpeg handbrake-cli`). BRAW decoding may need Blackmagic's SDK /
  `libbraw`; if unavailable in-container, transcode BRAW→ProRes upstream in Resolve and treat
  the ProRes as the master source for proxy generation.
- **SQLite lives on a bind-mount volume**, not inside the NAS media tree; the media mount is
  `:ro`, the derived subdir is writable.
- **Reverse proxy:** use Synology **Control Panel → Login Portal → Advanced → Reverse Proxy**
  (or Container Manager + a Caddy/nginx container). Map
  `https://portal.bjur.media` → `web:3000`, force HTTPS (Let's Encrypt via DSM), and set
  generous `proxy_read_timeout` / disable buffering so large range responses stream. If using
  nginx, `client_max_body_size` is irrelevant (no uploads) but set
  `proxy_request_buffering off;` and `proxy_buffering off;` on the media routes.
- Back up `./data/bjur.db` on the NAS schedule; the media itself is already the studio's
  primary store.

---

## 7. Seeding

The prototype's `clients` / `projects` / `assets` arrays (in `Bjur Portal.dc.html`,
constructor) are realistic seed data — port them into `prisma/seed.ts` to demo the app:
4 clients (SSH, 57.NYC, SUYINSAMA retainers; Halcyon one-off with a Sep 01 2026 expiry),
8 projects, and per-project assets including internal working masters and licensable BRAW
masters with base prices.
