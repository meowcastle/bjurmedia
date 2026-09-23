# Handoff: Bjur Portal v2

Rebuild of the Bjur Media delivery portal (`bjur-portal/`, Next.js + Prisma + SQLite). Same backend, new front end, several product changes. Read this file, then `AUDIT-v3.md` (live-code gap list and order of work), `SCREENS-D3-D4-D7.md` and `SCREENS-TODAY-BOARD-REPORTS.md` (screen specs), `SCHEMA.md` and `FLOWS.md`.

> **v3 (2026-09-21) supersedes the project model below.** Projects have two fixed types (Delivery, Social calendar) and one fixed feature (Review). Footage intake is a per-project *submission request* (send link, no login), not a toggle. Masters/licensing and auto-approve are removed. Integrations (Slack, accounts, AI captions) are client-level and optional, edited only on `/admin/integrations`. Prototype: `prototypes/Bjur Client Project Flow v3.dc.html` (FLOW v3.5) — the admin nav end to end (Today, week board, clients, project, integrations, reports) plus the client project page, viewer download sheet and public send page. Where it and `Bjur Portal v2.dc.html` disagree, v3 wins.

> **v4 (2026-09-23) adds a third project type, Film**, for music videos and narrative color work: numbered cuts, timestamped notes from every reviewer (client seats + guests by link), the studio answers every note in the next cut's email, an owner approves the final cut. Delivery loses its review option; `Project.review` is dropped. Spec: `SCREENS-FILM-REVIEW.md`. Build list: `AUDIT-v3.md` §G. Prototypes: `prototypes/Bjur Review v1.dc.html` (review screen; top strip switches Client/Studio and which reviewer you are) and `prototypes/Bjur Client Project Flow v4.dc.html` (FLOW v4 · FILM — v3 plus the Film create option, Film project page and Today items). Where v4 and v3 disagree, v4 wins.

## About the design files

`prototypes/*.dc.html` are **design references built in HTML**. They run standalone in a browser (open with `support.js` beside them) and fake all data and actions in browser state. Do not ship or copy them line for line. Recreate them in the existing Next.js/React app, reusing its components where they already exist (viewers, upload client, mailer, worker).

## Fidelity

**High-fidelity.** Colors, type, spacing, copy, motion and states are final. Match them closely. Where the prototype and the existing app differ in behavior, the prototype wins unless `FLOWS.md` says otherwise.

## What is new vs. the current app

| Area | Current app | v2 |
|---|---|---|
| Client types | Retainer / one-off | **One client type.** Project has a fixed `type` (Delivery / Social calendar) and fixed `review`; footage comes in via submission requests. Expiry optional. Payment hold is the only post-creation switch. |
| Approvals | Email approve/hold with auto-approve deadline | **Two loops.** Calendar projects: client approves in Slack (✅ / ✏️ reactions). Review projects: client gets an email per upload, approves or sends notes in the portal; notes are emailed to the studio. No auto-approve. |
| Slack | Weekly cron post | **Manual.** Admin posts one project's week from the board when ready, after a preview. Per-client channel. Push-only: the client's ✅ stays in the channel, so `POSTED` is where a card stops. |
| Captions | AI draft, flagged | Same, plus: AI drafts must be **approved by the admin** before the week can be posted to Slack. |
| Dashboard | Stats, feeds, views | **Today:** one list of things waiting on the admin (feedback, approvals, uploads landed, failed encodes) + activity log + one status line. No views. |
| Views | Dashboard + media rows | **Reports only.** |
| Media table | 1,300-line row table | **Week board:** 7 day columns, drag to schedule, side sheet for captions. |
| Viewer | Arrows + swipe | **Swipe only** (Photos-style), caption/date overlay, slimmer chrome, double-tap favorite, swipe-up master sheet with download/licensing. |
| Theme | Dark only | **Light/dark per portal**, remembered. Client defaults light, admin dark. |
| Type | Archivo | **Source Serif 4** (display) + **Fragment Mono** (everything else). |

## Screens

Every screen is in `prototypes/Bjur Portal v2.dc.html`; use the top switcher or the `startScreen` prop. Mobile frames: `prototypes/Bjur Mobile v2.dc.html`. Emails: `prototypes/Bjur Emails v2.dc.html`.

### Client portal (`/`)
| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | Split: serif headline left, form right. Theme toggle. Forgot-password sends reset link. |
| Deliveries | `/` | Serif greeting, "N need your review/OK" card, full-bleed hero for latest project, index list. |
| Project | `/p/[id]` | **v3 layout (D3):** split into **Delivered** (asset grid) and **Sent to Bjur** (submission requests + ↑ Send more). Hold copy is one line under the header. Full spec in `SCREENS-D3-D4-D7.md`. Supersedes the v2 week-timeline stream. |
| Upload | `/p/[id]/upload` | Drop zone, per-file progress, pause/resume. Keep existing chunked resumable client. |
| Settings | `/settings` | Profile, password (signs out other devices), email toggles, devices. Weekly digest toggle removed (E2). |
| Viewer | overlay | See FLOWS.md → Viewer. Keep `useMediaCarousel` mechanics. **v3 (D4):** swipe-up sheet is a plain download sheet — filename, specs, one button with live %, hold line. No licensing. |

### Admin (`/admin`)
| Screen | Route | Notes |
|---|---|---|
| Login | `/admin/login` | Dark variant. |
| Today | `/admin` | **v3 layout (D10):** needs-you list (dismiss with undo), activity log, status line (worker, Slack, account tokens). Full spec in `SCREENS-TODAY-BOARD-REPORTS.md`. |
| Week board | `/admin/board` | **v3 layout (D11):** tray + 7 days, drag to schedule, project chips, caption sheet, week preview + POST WEEK TO SLACK. Replaces `/admin/media` table + calendar. Posting is one-way; `POSTED` is terminal. |
| Clients | `/admin/clients/[id]` | Client tabs, quiet integrations line, projects (type badge + flag), seats. Right-side **create sheets** for Client / Project / Seat / Account / Staff. |
| Project | `/admin/projects/[id]` | **New in v3.** Inline-editable title/dates, facts, what it does, Payment (Hold/Release), Sent to Bjur (submission requests). |
| Integrations | `/admin/integrations` | **v3 layout:** one table, all clients — Slack channel, accounts, AI captions. |
| Reports | `/admin/reports` | **v3 layout (D12):** paper one-pager, print to PDF. Only place views appear. |
| Library | `/admin/library` | Archive tree, register in place, auto-map preview with format override. |
| Team | `/admin/team` | Staff logins, add/remove. |

### Public (no session)
| Screen | Route | Notes |
|---|---|---|
| Send | `/send/[projectSlug]/[nameToken]` | **New in v3 (D7).** No header, no nav, dark always. Serif BJUR + client name, dropzone, optional "Who's sending?" once files stage. Closed/expired renders the same shell with one line. Full spec in `SCREENS-D3-D4-D7.md`. |

## Not designed (keep or defer)
- **Admin on phone.** Decided but not built: week board shows one day at a time with swipe between days; admin nav collapses to a menu button. Build responsively from the desktop spec.
- **Photo viewer.** Keep the existing stills carousel; restyle chrome to match the video viewer (mono labels, same top/bottom bars).
- ~~Licensing dialog~~ **Removed in v3.** The viewer's swipe-up sheet is a plain download sheet (filename, specs, download %, hold line when watermarked).
- ~~Public send page~~ **Designed in v3 (D7).** See `SCREENS-D3-D4-D7.md`.
- **Release email** (`emails/released.tsx`). Works in the current app but has never been designed — it is improvised markup, not a template drawn to the system in `Bjur Emails v2.dc.html`. Not blocking; worth a pass later.

## Assets

None to hand over. Every thumbnail and poster frame in the prototypes is a generated gradient standing in for a real video still — in the app these come from `Asset.thumbRelPath` / `proxyRelPath` (and the marked variants while a project is held). No icon set: the few glyphs used are typed characters (`‹ › ↑ ↓ ✓ ✕ ▶ ✅ ✏️ ☾ ☼ ⌕`). Type is Google Fonts — Source Serif 4 and Fragment Mono; self-host both if the studio deploys without outbound font requests.

## Build order

`AUDIT-v3.md` §F is the sequence, §C is the delete list, §E records every closed decision. Open questions still needing a call are at the foot of `SCREENS-TODAY-BOARD-REPORTS.md`.

## Design tokens

Two palettes, same token names. Client portal defaults `light`, admin defaults `dark`; user toggle per portal, stored in `localStorage` (`bjur:v2:themeC`, `bjur:v2:themeA`).

```
token   light                      dark
--bg    #f6f4f0                    #0c0c0d
--bgA   rgba(246,244,240,.88)      rgba(12,12,13,.86)     sticky header (backdrop-blur 12px)
--s0    #f1eee8                    #101012                sheets
--s1    #eeebe5                    #151517                cards
--s2    #e6e2db                    #1c1c1f
--ink   #17161a                    #f2efe9                text, primary buttons
--body  #4a4844                    #c9c5bd
--mut   #6e6b66                    #a8a49c
--dim   #8a877f                    #8a877f                labels
--dim2  #b5b1a9                    #6f6c66
--rule  #dcd8d1                    rgba(255,255,255,.10)
--rule2 #cfcbc3                    rgba(255,255,255,.20)
--rule3 #17161a                    rgba(255,255,255,.50)  hover borders
--inkA  rgba(23,22,26,.04)         rgba(255,255,255,.03)  row hover
--ok    #2b6b47                    #2ec36b
--warn  oklch(0.55 0.19 25)        #ff9d85
--acc   per client (Client.accentColor), e.g. 57.NYC oklch(0.6 0.17 145)
```
Text on thumbnails is always fixed: `#fff`, `#f4f2ee`, `#7fe0a6` (approved), `#ffa08a` (needs attention).

**Type.** Source Serif 4 (400 headlines, 300 admin headlines, italic for emphasis) · Fragment Mono for all UI text. Sizes: 10 / 10.5 / 11 / 12 / 13 body; serif 20 / 22 / 26 / 30 / 34 / 48 / clamp(40px,5vw,72px). Letter-spacing on mono labels .06–.14em, uppercase.

**Radius 0** everywhere. Rules 1px `--rule`; section rules 1px `--ink`. Buttons: primary = `--ink` fill, `--bg` text, hover → `--acc`; secondary = 1px `--rule2` border, hover `--ink`.

**Motion.** `--eo: cubic-bezier(.22,1,.36,1)`, 150–300ms. Drawers/sheets `cubic-bezier(.32,.72,0,1)` 500ms. Buttons `:active` scale .97. Entrance `v2rise` (10px up + fade). Toasts bottom-center, 3.6s, with Undo where reversible. Honor `prefers-reduced-motion`.

## Files
- `prototypes/Bjur Review v1.dc.html` — **v4 review screen** (client + studio modes, reviewer switch, send batch, answer-and-release gate, cut-ready email preview, marker export).
- `prototypes/Bjur Client Project Flow v4.dc.html` — **v4 flow**: everything in v3, plus Film in the create sheet, Film project page (cuts + reviewers, open Adam Knights → HURT — Music Video) and the Today notes-in row. Links to the review screen.
- `SCREENS-FILM-REVIEW.md` — full spec for Film: loop, review screen, emails, project page, create sheet, Today, open decisions.
- `prototypes/Bjur Client Project Flow v3.dc.html` — **v3 flow (FLOW v3.5)**, ten screens on the top strip: **Today (D10)**, **week board (D11)**, admin client page, admin project page, integrations, **reports (D12)**, new-project and new-client sheets, plus **client project page (D3)**, **viewer download sheet (D4)** and **public send page (D7, live + closed)**. Props: `showSenderName`, `sendBrandScale`, `showPreviewMark`.
- `SCREENS-D3-D4-D7.md` — full spec for the client project page, viewer sheet and send page.
- `SCREENS-TODAY-BOARD-REPORTS.md` — full spec for Today, the week board and reports, with the field behind every state.
- `prototypes/Bjur Portal v2.dc.html` — all other screens (props: `client`, `startScreen`, `mobile`, `slackConnected`). Its create sheet, client-page right column and viewer master sheet are superseded by v3.
- `prototypes/Bjur Mobile v2.dc.html` — three phone frames (deliveries, review project, viewer).
- `prototypes/Bjur Emails v2.dc.html` — flow map + 8 templates.
- `prototypes/ios-frame.jsx`, `prototypes/support.js` — runtime for the above.
- `SCHEMA.md` — Prisma deltas. `FLOWS.md` — behavior spec per flow.
