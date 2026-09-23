# Screens D3 · D4 · D7 — client project page, viewer download sheet, public send page

Design spec for the three screens added to the prototype on 2026-09-21. Everything here is drawn in
`prototypes/Bjur Client Project Flow v3.dc.html` (FLOW v3.5) — reach them from the top strip:
**CLIENT VIEW**, **VIEWER**, **SEND**, **SEND · CLOSED**.

These are **high-fidelity**. Colors, type, spacing and copy are final. Tokens are the dark column of
the table in `README.md → Design tokens`; radius is 0 everywhere; `--eo` is
`cubic-bezier(.22,1,.36,1)`; `v3rise` is 10px up + fade.

Copy is verbatim. Do not reword.

---

## D3 — Client project page (`/p/[id]`)

Replaces the single week-timeline stream with two sections: what Bjur delivered, and what the client
sent in. `ProjectDetailClient.tsx`.

**Header (client portal chrome).** Sticky, `padding:18px 40px`, `border-bottom:1px var(--rule)`,
`background:var(--bgA)`, `backdrop-filter:blur(12px)`, `z-index:20`.
`BJUR / {CLIENT}` at 12px / `.14em` (the client half in `--dim`); nav `PROJECTS · POSTS · SETTINGS`
at 11px / `.06em`, gap 22px, active item `--ink` with a 1px bottom rule; right-aligned owner line
`{NAME} · OWNER` at 10.5px / `.06em` / `--dim`.

**Page.** `max-width:1100px`, `margin:0 auto`, `padding:44px 40px 140px`.

| Element | Spec |
|---|---|
| Back | `← PROJECTS`, 11px / `.1em` / `--dim`, `margin-bottom:22px` |
| Eyebrow | `DELIVERED {DATE}` uppercase, or `NOT YET DELIVERED` when none. 11px / `.14em` / `--dim`, `margin-bottom:14px` |
| Title | Source Serif 4 300, `clamp(38px,4.8vw,60px)`, `line-height:.98`, `letter-spacing:-.025em` |
| Header block | `padding-bottom:22px`, `border-bottom:1px var(--rule2)`, entrance `v3rise .5s` |

**Hold line.** When `project.paymentHold`, one line directly under the header — `padding:13px 0`,
`border-bottom:1px var(--rule)`, 11.5px / `--mut` / `line-height:1.6`:

> Downloads carry a preview mark until the invoice is settled.

No red, no lock glyph, no paragraph. This replaces the current "These files carry a BJUR MEDIA
watermark…" block at ~L651. The same sentence appears in the viewer's download sheet (D4) and
nowhere else.

**DELIVERED.** `margin-top:48px`. Section head: label 11px / `.1em` / `--dim` left, `N files` in
`--dim2` right, `padding-bottom:10px`, `border-bottom:1px var(--rule2)`.

Grid `repeat(auto-fill,minmax(228px,1fr))`, `gap:3px`, `margin-top:3px`. Each tile is a button,
`background:var(--s1)`, hover `--s2`, entrance `v3rise .45s` staggered 40ms:

- Thumb: `aspect-ratio:16/9`, `background:var(--s0)`, `border-bottom:1px var(--rule)`.
  - `PREVIEW MARK` at `left:9px top:9px`, 10px / `.12em` / `--mut` — **only when the project is held.**
  - Duration at `right:9px bottom:9px`, 10px / `.06em` / `--mut`.
- Meta: `padding:13px 15px 15px`. Filename 12px, ellipsis, nowrap. Specs on the next line,
  10.5px / `--dim`, `margin-top:6px`, formatted `{resolution} · {codec} · {size}` —
  e.g. `3840×2160 · ProRes 422 HQ · 8.2 GB`.

Click opens the viewer (D4) at that index. **No price badge** — the `AssetTile` badge at ~L88 goes.

**SENT TO BJUR.** `margin-top:48px`, same section head with `N files received` on the right.
One row per `SubmissionRequest`: grid `minmax(0,1fr) auto`, `gap:6px 20px`, `padding:16px 0`,
`border-bottom:1px var(--rule)`.

- Name — Source Serif 4, 19px, `-.01em`
- Status, right — 10px / `.08em`: `OPEN` in `--ok`, `CLOSED` in `--dim2`
- Counts — 11px / `--dim`: `41 files · 62 GB`, or `Nothing sent yet`
- `↑ SEND MORE`, right — 10.5px / `.08em` / `--mut` → `--ink`, **open requests only**. Navigates to
  that request's send page (D7) at `/send/{projectSlug}/{name}-{token}`.

Empty: `Nothing requested on this project.` 11px / `--dim2`.

**Also remove** with this screen: the `LicensingDialog` import and usage (~L16, ~L853), and
`approvalDueAt` / `heldAt` props plus the "Auto-publishes…" line in `ClientPostsPanel` (~L135).

---

## D4 — Viewer download sheet

`VideoViewer` / `VideoChrome` / `AssetTile`. Keep the existing `useMediaCarousel` swipe mechanics and
chrome; only the swipe-up sheet changes. Gone: `locked`, `licensable`, "Unlock master", `MasterSheet`.

**Stage.** Full-bleed `#000`, column layout.

- Top chrome, `padding:16px 22px`: `← CLOSE` 11px / `.1em` / `--dim` → `--ink`; filename centered,
  11.5px / `--body`, ellipsis; index `1 / 4` right, 10.5px / `.06em` / `--dim`.
- Frame: `max-width:1000px`, `aspect-ratio:16/9`, `background:#0a0a0a`,
  `border:1px solid rgba(255,255,255,.08)`.
  - Watermark, centered, only when held: the word `BJUR MEDIA` at
    `clamp(16px,2.6vw,30px)` / `.34em` / `rgba(255,255,255,.07)`. (Production renders the real marked
    proxy; this is the placeholder.)
  - Scrub row at the bottom, `padding:12px 16px`: timecode 10.5px / `--mut`, 2px track
    `rgba(255,255,255,.14)` with an `--ink` fill, duration 10.5px / `--dim`.

**Sheet.** `border-top:1px rgba(255,255,255,.12)`, `background:var(--bg)`.

Handle is a full-width button, `padding:11px 0 7px`, centered: a 30px × 1px rule
`rgba(255,255,255,.22)` either side of a 10px / `.14em` / `--dim` label — `DOWNLOAD ▾` when open,
`DOWNLOAD ▴` when closed. Swipe-up opens it on touch; the handle is the pointer equivalent.

Body: `max-width:1000px`, `padding:6px 22px 30px`, entrance `v3rise .3s`.

| Element | Spec |
|---|---|
| Filename | Source Serif 4 300, 26px, `-.02em`, `word-break:break-all`, `margin-bottom:12px` |
| Specs row | Four items — resolution, codec, size, duration. 11px / `--dim`, `gap:22px`, wraps. `padding-bottom:14px`, `border-bottom:1px var(--rule)`, `margin-bottom:16px` |
| Hold line | Only when held. 11.5px / `--mut`, `line-height:1.6`, `max-width:52ch`, `margin-bottom:18px`. Same sentence as D3 |
| Download | One button. `max-width:340px`, `border:1px var(--ink)`, `padding:14px 16px`, 11px / `.08em`, centered, hover `background:var(--inkA)` |
| Progress | 2px rule under the button, same 340px, track `rgba(255,255,255,.12)`, fill `--ink`, `margin-top:3px` |

Button label runs `DOWNLOAD` → `DOWNLOADING 41%` → `DOWNLOADED` (label drops to `--dim` when done).
Percentage is live and tracks the real transfer; the rule fills with it. Re-clicking while running
does nothing.

---

## D7 — Public send page (`/send/[projectSlug]/[nameToken]`)

No session. This is the only screen a stranger sees, so it carries the brand and nothing else.

**Chrome: none.** No header, no nav, no footer, no theme toggle. **Dark always** (`#0c0c0d`),
regardless of the client portal's light default — a first-time visitor has no stored preference and
this page is not part of the portal.

**Layout.** Centered on both axes, `padding:72px 24px 120px`, `min-height:100vh`.
Content column `max-width:560px`.

**Brand.** `margin-bottom:54px`, entrance `v3rise .5s`.

- `BJUR` — Source Serif 4 300, `clamp(54px,9vw,86px)`, `line-height:.88`, `letter-spacing:-.035em`
- Client name under it, uppercase — 11px / `.18em` / `--dim`, `margin-top:18px`

A compact alternative (`BJUR / {CLIENT}` on one 12px / `.14em` line, `margin-bottom:40px`) is wired
to the `sendBrandScale` prop for comparison. Serif is the chosen default.

**Dropzone.** Full width, `border:1px dashed var(--rule2)`, `padding:62px 24px`, column, centered,
`gap:11px`. Hover: border `--ink`, `background:var(--inkA)`.

> Drop files here — 13px / `--body`
> or choose from your computer — 11px / `--dim`

Present in every live state, **including after a successful send** — the page never stops accepting
files. Real drag-and-drop plus a file input.

**Staged list.** `margin-top:28px`, below the dropzone. One row per file: grid
`minmax(0,1fr) auto`, `gap:5px 16px`, `padding:13px 0`, `border-bottom:1px var(--rule)`.

- Filename 12px, ellipsis · size 10.5px / `--dim`
- State label, right, 10.5px / `.06em`: `READY` `--dim2`, `QUEUED` `--mut`, `41%` `--mut`,
  `✓ SENT` `--ok`
- Per-file progress: 2px rule spanning both columns, `margin-top:4px`, track
  `rgba(255,255,255,.1)`, fill `--ink`

**Sender field.** Appears **only once files are staged**, below the dropzone and list, above the send
button (`margin-top:26px`). Hidden during upload and after it finishes.

- Label `WHO'S SENDING?` 10px / `.1em` / `--dim`, with `— OPTIONAL` in `--dim2`
- Input 15px, transparent, `border-bottom:1px var(--rule2)` → `--ink` on focus,
  `padding:6px 0 10px`, placeholder `Your name`

Writes `UploadBatch.senderName`. When present, the Today item and the staff alert read
`Upload landed · Berlin raws · from Marcus`; when absent, they drop the `from` clause.
Toggleable via the `showSenderName` prop.

**Send button.** Full width, `background:var(--ink)`, `color:var(--bg)`, `padding:15px 16px`,
11px / `.08em`, `margin-top:26px`. Label `SEND 3 FILES →` (`SEND 1 FILE →` singular).

**Done.** Rows turn to `✓ SENT`, and one line at `margin-top:26px`, 13px / `--body`:

> Bjur has it.

With a name given, it becomes `Bjur has it. Sent as Marcus.` The dropzone stays open above it;
using it again starts a fresh batch. No receipt, no timestamp, no link away.

**Closed or expired.** Same brand block, and in place of the dropzone: `border-top:1px var(--rule2)`,
`padding-top:24px`.

> This line at 15px / `--body`: **This link is closed.**
> Then 11.5px / `--dim` / `line-height:1.7`: **Ask for a new one at hello@bjurmedia.nyc**
> (address in `--mut` with a 1px `--rule2` underline)

One state for both causes — a closed link and an expired one read the same. No dropzone, no dates.

**Deliberately absent.** No request name, no staff name, no note from Bjur, no accepted formats, no
size ceiling, no expiry date. The brand line and the dropzone are the whole page. If a request needs
explaining, that belongs in the email or Slack message carrying the link, not here.

### Behavior notes

- Resolve `SubmissionRequest` by `nameToken`. If `closedAt` is set or `expiresAt` has passed, render
  the closed shell above — the page shell, not a bare 404 body. (The route still answers 404 for a
  token that never existed.)
- Uploads reuse `SubmissionUploadClient` wholesale: 16 MB chunks, resumable, pause/resume. It gains a
  token-based entry point with no `userId` — `UploadBatch.userId` is nullable after migration B4.
- Files land under `submissions/{request.name}/` inside the project inbox (`submissionRelPath()`).
- Logged-in clients reaching this page from **↑ Send more** (D3) get the identical page — same URL,
  same chrome, still no portal header. One screen, one implementation.
- Progress in the prototype is faked on a timer. Wire it to real chunk callbacks.

---

## Prototype props

`prototypes/Bjur Client Project Flow v3.dc.html` exposes three switches for reviewing these screens:

| Prop | Default | Effect |
|---|---|---|
| `showSenderName` | `true` | Shows / hides the "Who's sending?" field (D7) |
| `sendBrandScale` | `"serif"` | `serif` or `compact` brand treatment (D7) |
| `showPreviewMark` | `true` | Shows / hides the `PREVIEW MARK` chip and the watermark word on held files (D3, D4) |

These exist for design review. They are not product settings and need no equivalent in the app.
