# Handoff: Bjur Media Delivery Portal

A self-hosted client media-delivery portal for Bjur Media. Clients log in to stream and
download their deliverables; the studio manages clients, projects, media registration, and
BRAW licensing from an admin panel. Runs on the studio's Synology NAS via Docker.

---

## About the design files

The files in `prototypes/` are **design references created in HTML** — an interactive
prototype showing the intended look, layout, copy, and behavior. **They are not the
production app and should not be shipped or copied line-for-line.**

Your task is to **build a real Next.js + Prisma + SQLite application** that reproduces these
designs and wires up the real backend behind them. The prototype fakes all data and actions
in browser state (`Bjur Portal.dc.html`, a single React-style class component). Use it as the
source of truth for **UI/UX, copy, and workflows**; use the companion docs for the backend.

Read these in order:

1. **`README.md`** (this file) — product overview, screens, design tokens, fidelity.
2. **`ARCHITECTURE.md`** — data model (Prisma schema), auth, media serving, ffmpeg worker,
   Docker + reverse-proxy config. This is the build spec for the backend.
3. **`ENCODING.md`** — the HandBrake / ffmpeg recipe for proxies and thumbnails
   (H.264, Rec.709, RF, faststart, BRAW watermarking).
4. **`SLACK.md`** — Slack integration: webhook payloads, the weekly-calendar cron, and the
   per-event automation hooks.
5. **`SCAFFOLD.md`** — the suggested Next.js project file tree and a screen → route →
   component map, so the build stays organized and every prototype screen is traceable to
   real files. Start here when scaffolding.

---

## Fidelity

**High-fidelity.** Colors, type, spacing, copy, and interaction states in the prototype are
final. Reproduce the UI pixel-close. The design is a **dark-inverted** take on the Modernist
system (see Design Tokens below): hard edges, zero border-radius, 2px rules, single red
accent, near-black ground, Archivo throughout.

---

## Roles & access model

- **Two portals, one app.** Client portal at `/`; staff/admin portal at `/admin`. The
  prototype switches via URL hash (`#/admin`); in production these are separate route groups
  behind the same auth system with different session scopes.
- **Client users** belong to a **Client** (org) and have a role: **Owner** (full access +
  manages seats), **Downloader** (view + download), **Viewer** (view/stream only, no
  download). Clients never see other clients' projects.
- **Uploads/registration are admin-only.** Clients never upload; they only consume.
- **Client types:** **Retainer** (57.NYC, SSH, SUYINSAMA) = permanent libraries, never
  expire. **One-off** (e.g. Halcyon Films) = optional per-project expiry date.

---

## Screens / views

All screens live in `prototypes/Bjur Portal.dc.html`. Section markers in the template
(`<!-- ══ LOGIN ══ -->`, etc.) map to the views below.

### 1. Login (`isLogin`)
Split screen. Left: cinematic panel with kicker + huge Archivo-900 headline + blurb; brand
mark top-left; "Self-hosted · Synology NAS" footer. Right: sign-in form on `--s1` surface —
a mono URL-bar chip (green dot + `https://<address>`), Username + Password fields, flush-left
primary button "Sign in →". Copy and headline differ per portal (client vs admin), driven by
`loginKicker/loginHeadA/loginHeadB/loginBlurb/loginEyebrow/loginFormTitle`. Footer offers a
demo autofill link and a "switch portal" link. Error state renders a red inline message.
Security note: "Encrypted session · rate-limited · argon2 hashed".

### 2. Client — Project list (`isClient` + `showList`)
Sticky header (brand, "Client Portal" label, client name + initials avatar → settings, Sign
out). "Your Deliveries / Projects" heading + count. Responsive card grid
(`repeat(auto-fill,minmax(330px,1fr))`). Each card: 16:10 cover with gradient scrim, optional
red "Expires <date>" badge (one-off only), asset-count label + arrow, status kicker, title,
"Delivered <date>".

### 3. Client — Project detail (`showDetail`)
Back link. Header: client kicker, title, meta row (asset count · delivered · optional
"Available until <date>"), a mono `MEDIA_ROOT / <path>` breadcrumb with a
`PROJECT · DATE · FORMAT` chip, and a red "↓ Download all" button. Filter row: format segmented
control (ALL / VIDEO / PHOTO / FAVORITES) + a grouping toggle (by Format / by Week — the
week grouping is 57.NYC's IG workflow). Below, assets are grouped into folder sections
(header = group label + count + mono folder path), each a responsive grid of asset tiles.

**Asset tile:** aspect-ratio driven by orientation; gradient scrim; a select checkbox
(top-left), a favorite heart (top-right), a ▶ play affordance for video. **BRAW masters**
(`raw:true`) render a diagonal repeating "BJUR MEDIA · PREVIEW" watermark and a locked
bottom bar with a 🔒 name + price → opens the licensing dialog. Caption bar shows name +
badge (dimensions / duration). Below the tile, a timestamp line ("Added … · Updated …").
Empty favorites state has its own placeholder card.

### 4. Client — Photo lightbox (`lb`) & Video player (`vm`)
Lightbox: full-bleed still with prev/next. Video player: streams the H.264 proxy; download
button triggers a **resumable** download of the master (`vmDownloadFn`).

### 5. Client — Licensing dialog (BRAW) (`pay`)
Modal: "Unlock master · BRAW", asset name, three selectable tiers (radio rows) computed by
`licenseTiers(basePrice)`:
- **Social & Digital** — `base` — "Organic social, web & internal use · 1 year"
- **Commercial & Broadcast** — `base × 2` — "Paid ads, TV / OTT, out-of-home · 2 years"
- **Full Buyout** — `base × 4` — "All media, worldwide, in perpetuity"
Amounts round to nearest $50. Footer confirms "Full-res <size> BRAW master · watermark
removed · resumable download". Confirm → grants access (`unlocked`), records a License, fires
the licensing Slack hook.

### 6. Client — Account settings (`showSettings`)
Profile (display name, email), Security (change password; note "updating your password signs
out all other sessions"), Notifications (two toggles: new-delivery email, expiry reminder),
Active sessions (device / location / when, "This device" badge, Revoke buttons).

### 7. Admin — Dashboard (`isAdmin` + `tabHome`)
Sticky header: brand, "Admin" label, tab bar (Home / Clients / Projects / Media / Library /
Integrations), global search box (clients/projects/files with a grouped results dropdown),
Sign out. Body: date kicker + "Dashboard"; + Client / + New project actions; a 4-up stat grid;
a worker-status strip ("ffmpeg worker online · N process", "Proxies in queue N", "Import
library →"); a two-column row of "Recent activity" (dotted feed) and "Expiring soon".

### 8. Admin — Clients (`tabClients`)
Table: Client / Type / Projects / Users / Status. Each row expands to show user seats
(name, email, role, last login) with an "add seat" invite action. Create client dialog;
enable/disable toggle.

### 9. Admin — Projects (`tabProjects`)
Table of galleries; create/assign-to-client dialog; set expiry or mark permanent.

### 10. Admin — Media (`tabMedia`)
Per-project asset management. Register-from-NAS panel (mono NAS path input + "Scan"); files
land in `CLIENT / PROJECT / DATE / FORMAT`. Proxy/thumbnail queue status per asset
(`PENDING → GENERATING → READY`). Per-asset **internal ↔ client-facing** toggle (retainer
working masters are `internal:true` and hidden from clients). BRAW licensing enable + tier
pricing.

### 11. Admin — Library / Import (`tabLibrary`)
Cherry-pick from the **existing unorganized NAS archive** (a nested folder tree). Multi-select
files, choose a target project, and an **auto-map** step previews the corrected
`PROJECT / DATE / FORMAT` destination path for review/correction before registering. No
re-upload — registration references files in place.

### 12. Admin — Integrations / Slack (`tabIntegrations`)
See `SLACK.md`. Connection card, default channel, weekly-calendar schedule (day + time),
per-event automation toggles, per-client channel overrides.

### 13. Client onboarding email
`prototypes/Client Onboarding Email.dc.html` — dark Modernist templated email with portal
URL, username, and a temp-password note. Send on client/seat creation.

---

## Interactions & behavior

- **Navigation** is state-driven (`view`, `clientSub`, `adminTab`, `projectId`). In
  production, use real routes: `/`, `/p/[projectId]`, `/settings`, `/admin`,
  `/admin/clients`, `/admin/projects`, `/admin/media`, `/admin/library`,
  `/admin/integrations`.
- **Toasts** confirm every mutation (`toast()`), auto-dismiss ~2.6s.
- **Streaming vs download:** video tiles stream the H.264 proxy inline; master downloads are
  resumable (HTTP range). See ARCHITECTURE → Media serving.
- **Licensing gating:** a client can stream a watermarked proxy of a BRAW master but can only
  download the clean master after purchasing a tier.
- **Internal assets** never appear in any client-facing query.
- **Animations:** `bjfade` (0.3–0.5s opacity), `bjrise` (10px translateY + fade), `bjspin`,
  `bjpulse`. Backdrop-blur sticky headers. Keep these.
- **Focus states:** inputs use `border-color: var(--accent)` on focus; buttons darken to
  `--accentb` on hover.

---

## Design tokens

Dark-inverted Modernist. Pull these into your CSS variables / Tailwind config verbatim.

```
--bg      #0a0a0b   near-black ground
--s1      #141416   surface 1 (cards, forms)
--s2      #1c1c1f   surface 2 (dialogs, dropdowns)
--s3      #26262b   surface 3 (avatars, chips)
--line    rgba(255,255,255,.10)   hairline divider
--line2   rgba(255,255,255,.20)   strong 2px rule
--text    #f4f3f2   primary text
--muted   rgba(244,243,242,.56)   secondary text
--dim     rgba(244,243,242,.34)   tertiary / mono meta
--accent  #ec3013   red (primary action, emphasis)  ← from Modernist
--accentb #ff5a3c   red hover
success   #2ec36b   green status dots
```

- **Type:** Archivo (400–900). Weights used: 900 (display headlines), 800 (titles), 700
  (labels/buttons), 600 (meta), 400 (body). Mono meta uses `ui-monospace`.
- **Type scale:** headlines `clamp(42px,5.6vw,76px)` / 44 / 40 / 38 / 36 / 34; body 14–16;
  labels 10–13 uppercase with `.06–.28em` letter-spacing.
- **Radius: 0 everywhere.** No rounded corners (except intentional circles: avatars, status
  dots, radio dots, play-button ring).
- **Rules:** 2px `--line2` between major sections; 1px `--line` for row dividers.
- **Buttons:** primary = solid `--accent` fill, `#0a0a0b` text, flush-left label (Modernist
  rule); secondary = transparent + `--line2` border; ghost = text only.
- **Spacing:** 40px page padding; 14–24px card padding; 16–24px grid gaps.

---

## Assets

- **Logo:** the prototype uses a placeholder — a 14–15px red square + "BJUR" (900) + "MEDIA"
  (600, letter-spaced). **Replace with the real Bjur Media logo** (see "Design polish" —
  asset still needed from the studio).
- **Cover / thumbnail imagery:** the prototype uses generated gradient placeholders (`G[]`
  array, `g(i)`). In production these are the ffmpeg-generated thumbnails / poster frames.
- **Icons:** Lucide (per Modernist). The prototype uses unicode glyphs (→ ↓ ▶ ♥ ✓ ⌕) as
  stand-ins; swap for Lucide in the real build.
- **Fonts:** Archivo via Google Fonts (or self-host for the air-gapped NAS deployment).

---

## Files in this bundle

- `README.md` — this file.
- `ARCHITECTURE.md` — backend build spec.
- `ENCODING.md` — proxy/thumbnail encoding recipe.
- `SLACK.md` — Slack integration spec.
- `prototypes/Bjur Portal.dc.html` — the full interactive prototype (all screens + fake
  data + state logic). Open directly in a browser.
- `prototypes/Client Onboarding Email.dc.html` — the onboarding email template.
- `prototypes/support.js` — runtime for the `.dc.html` prototypes (needed to open them).

> The `.dc.html` files are a proprietary design-prototype format. They run standalone in a
> browser for reference. **Do not** try to reuse `support.js` or the `<x-dc>` runtime in the
> production app — rebuild the UI natively in Next.js/React.
