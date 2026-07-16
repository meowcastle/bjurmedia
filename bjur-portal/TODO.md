# bjur-portal — remaining work

Client portal, auth, media streaming, worker (ingest + proxies), Slack event lib, and Docker
are done and building clean. What's left, in order (spec refs → `../design_handoff_bjur_portal/`):

## 1. Admin portal (main blocker)

Prototype source of truth: `prototypes/Bjur Portal.dc.html` (admin tabs). Spec: README.md
screens 7–12, SCAFFOLD.md route map.

- [ ] `/admin` dashboard — replace stub in `src/app/admin/(app)/page.tsx`: stats, worker/proxy
      queue strip, activity feed, expiring projects
- [ ] `/admin/clients` — client orgs + seats CRUD (Owner/Downloader/Viewer roles, retainer vs
      one-off type)
- [ ] `/admin/projects` — project CRUD, expiry dates, cover, delivered date
- [ ] `/admin/media` — register-from-NAS, proxy queue view, internal toggle, BRAW base pricing
      → needs `api/admin/register` (create Asset rows + enqueue proxy)
- [ ] `/admin/library` — archive tree scan + cherry-pick import with auto-map preview
      → needs `api/admin/library/scan`
- [ ] `/admin/integrations` — Slack config UI (webhook, default channel, per-client channel
      overrides, event toggles) backed by existing `SlackConfig`/`ClientChannel` models
- [ ] `GET /api/admin/search?q=` — global admin search across clients/projects/assets (header)

## 2. Slack — finish

- [ ] `api/slack/weekly/route.ts` — weekly calendar cron target (SLACK.md §weekly)
- [ ] Wire remaining event hooks if any are unposted (upload/download/license toggles exist in
      `src/lib/slack.ts`)

## 3. Onboarding email

- [ ] `src/emails/onboarding.tsx` from `prototypes/Client Onboarding Email.dc.html`, sent on
      client/seat creation

## 4. Pre-deploy hardening

- [ ] `next.config.ts`: add `output: "standalone"` (SCAFFOLD.md) and slim the Dockerfile
      runtime stage accordingly
- [ ] Replace seed dev password flow — force password change on first login, or generate
      per-user invite passwords
- [ ] `pnpm build` + lint clean; smoke test both portals

## 5. Deploy (human steps — Justin, not Claude Code)

Port: host **3003** → container 3000 (already set in docker-compose.yml; 3000–3002 taken).
Domain: **portal.justinbjur.com** (GoDaddy DNS).

1. DSM → External Access → DDNS (if not already set up)
2. GoDaddy → justinbjur.com → add CNAME `portal` → the synology.me DDNS hostname
3. Copy repo to NAS; create prod `.env`: fresh `SESSION_SECRET`, `SLACK_WEBHOOK_URL`
4. Verify `/volume1/media/Bjur` volume paths in docker-compose.yml match the real share
5. `docker compose build && docker compose up -d`
6. `prisma migrate deploy`; seed real clients/users (no dev password)
7. DSM → Security → Certificate → Let's Encrypt for portal.justinbjur.com (after DNS resolves)
8. DSM → Reverse Proxy: HTTPS/portal.justinbjur.com/443 → HTTP/localhost/3003; assign new cert
   to this rule only (don't touch existing rules/certs — other sites depend on them)
9. Smoke test over the public URL: login both portals, video scrub (range/206), master
   download, zip download-all, inbox ingest, Slack post
