# Screens: Today, Week board, Reports (D10–D12)

Date: 2026-09-22. Reference prototype: `prototypes/Bjur Client Project Flow v3.dc.html` (FLOW v3.5) — screens `TODAY`, `BOARD`, `REPORTS` on the top strip.

**High-fidelity.** Colors, type, spacing, copy, motion and states are final. Tokens are the dark admin palette in `README.md`; nothing new is introduced here.

Every state in this spec maps to a field that already exists in `prisma/schema.prisma` — the v3 migration (`20260921100000_v3_project_shape`) has landed in the working copy. No new tables are needed for these three screens.

---

## The updated admin nav

`TODAY · BOARD · CLIENTS · INTEGRATIONS · REPORTS` — five items, in that order, left of centre; `+ CLIENT` and `+ PROJECT` pinned right.

- Sticky, `padding:18px 40px`, `border-bottom:1px solid --rule`, `background:--bgA` + `backdrop-filter:blur(12px)`, `z-index:20`.
- Items: 11px mono, `letter-spacing:.06em`. Active `--ink` with a 1px `--ink` underline 3px below the text; inactive `--dim`, hover `--ink`.
- `BOARD`, not `WEEK BOARD` (v2's label). The heading on the page carries the week.
- `LIBRARY` and `TEAM` are **not** in the nav. Their routes stay; see Open questions.

## D10 · Today — `/admin`

The only page that opens on a working day. One list of things waiting on a person, then what happened, then whether the machinery is up.

**Frame.** `max-width:1100px`, centred, `padding:52px 40px 140px`.

**Header.** Date kicker `MON SEP 21, 2026` — 11px mono, `.14em`, `--dim`. Headline serif 300, `clamp(40px,5vw,72px)`, `line-height:.98`: `{n} things need you.` / `1 thing needs you.` / `Nothing needs you.` Nothing else in the header — no stat tiles, no greeting.

**Needs list.** Rows separated by 1px `--rule` (rule above each row and one closing the list), `padding:18px 0`, grid `auto / minmax(0,1fr) / auto`, `gap:20px`, entrance `v3rise` staggered 60ms.

| Part | Spec |
|---|---|
| Thumb | 40px wide for 9/16, 72px for 16/9, poster frame, no radius |
| Kind + client | 11px mono `.08em`, 6px square dot in the same color, `{KIND} · {client}` |
| Subject | serif 22px, `line-height:1.15` |
| Quote | only on feedback: 13px `--body`, 12px left padding, 1px `--rule2` left border, `max-width:60ch` |
| Body | 11px `--dim` — who, when, and the fact that matters |
| Action | primary button, 11px `.08em`, `--ink` fill / `--bg` text |
| Dismiss | 10.5px `--dim` text button under the action, hover `--ink` |

Item kinds, in the order they should sort (newest first within a kind):

| Kind | Color | Source | Subject / body | Action | Dismiss |
|---|---|---|---|---|---|
| `FEEDBACK` | `--warn` | `Review` where `state = FEEDBACK` and `respondedAt` not yet seen | asset title + version; quote is `Review.feedback` verbatim | `OPEN PROJECT` → `/admin/projects/[id]` | `HANDLED` |
| `UPLOAD LANDED` | `--ok` | `UploadBatch` completed, grouped per batch | `{request.name} · {n} files · {size}`; body `from {senderName} · finished {time} · submissions/{slug}/` | `OPEN PROJECT` | `PULLED` |
| `CAPTION TO APPROVE` | `--ink` | `Asset` with `weekOf` set and `captionApprovedAt = null` | `{title} · AI draft` when `captionSource = AI`; body names the project, the day, and that the week can't go out | `OPEN BOARD` → board with that card selected | `LATER` |
| `ENCODE FAILED` | `--warn` | `Asset.proxyStatus = FAILED` (and `publishState = FAILED`) | filename; body is the real error line | `RETRY` (re-queues) | `IGNORE` |
| `APPROVED` | `--ok` | `Review` where `state = APPROVED` | asset title + `cleared`; body is who and when | `OPEN PROJECT` | `SEEN` |

The first four are the ones drawn in the prototype — one Monday's snapshot. `APPROVED` uses the same row, and `GET /api/admin/today` returns all five (see `FLOWS.md` §6).

Where `senderName` is null the body reads `from a send link`. No item invents a count it doesn't have.

**Dismiss is per-admin and reversible.** Row leaves immediately; toast bottom-centre, `--ink` fill, 3.6s, with `UNDO`. Dismissing is not a state change on the record — it only hides the item.

**Empty state.** When the list is clear, the headline says so and one 12px `--mut` paragraph explains what will land here. No illustration.

**Recent activity.** Label row `RECENT ACTIVITY` / `{n} · 7 DAYS`, 11px `.1em` `--dim`. Rows: grid `82px / minmax(0,1fr) / auto`, 12px, 1px `--rule` above each. Actor in `--ink`, action in `--mut`, client right in 10.5px `--dim`. Straight from `Activity` (`actor`, `action`, `createdAt`), no grouping.

**Status line.** 56px below the log, 10.5px `.06em` `--dim`, three items with 6px dots:

- `WORKER · {n} IN QUEUE` — dot `--ok` while `WorkerHeartbeat.lastSeen` is fresh, `--warn` when stale.
- `SLACK · {workspace}` — from `SlackConfig.connected` / `workspace`.
- `ACCOUNTS · 3 SYNCED`, or `ACCOUNTS · @HANDLE TOKEN EXPIRED` in `--warn` with a `RECONNECT` link when any `SocialAccount.tokenExpiresAt` is inside 10 days or `lastSyncError` is set.

## D11 · Week board — `/admin/board`

Replaces `/admin/media`. Seven day columns and a tray; the caption sheet on the right; one button that sends the week.

**Frame.** `padding:32px 40px 80px`, horizontal scroll, grid `min-width:1040px`.

**Header.** `‹ Week of Sep 21 ›` — serif 300, 40px, arrows 16px `--dim` (`--dim2` when there is nowhere to go). Project chips after it: `ALL` plus one chip per calendar project, `{CLIENT} / {PROJECT}`, 10.5px, 6px accent dot, active = `--ink` fill. Right: the post button. Under the header one 11px `--dim` line: `{n} on the week · {n} not scheduled · {project} posts to {channel}`.

**Grid.** `154px repeat(7, minmax(0,1fr))`, `gap:3px`, `min-height:560px` per column. Weekdays `--s1`, Sat/Sun `--s0`, tray `--s0` with a 1px dashed `--rule2` border. While dragging every column goes `--s2` with a 1px inset `--rule2` ring and shows a `DROP · {DOW}` dashed target. Column head: `{DOW}` left, `SEP {d}` right, 10px `.08em`; today's column head is `--ink`.

**Card.** `aspect-ratio:9/16`, poster frame background, 2px left border in the client accent, `outline:2px solid --ink` `offset:3px` when selected, `opacity:.4` while dragged, hover `translateY(-2px)`. Top-left: 5px dot + state, 9.5px `.06em`, with `text-shadow:0 1px 2px rgba(0,0,0,.7)`. Bottom: serif 15px title over a `rgba(0,0,0,.8)→transparent` gradient, then 9.5px `{client} · {time} · {channels}`. Tray cards show the caption's condition instead of a state (`AI DRAFT` / `CAPTION READY` / `NO CAPTION`) and the filename at the bottom when there is no title.

**States.** UI label ← the field that decides it. Colors are fixed hexes because they sit on imagery.

| Label | Truth | Color |
|---|---|---|
| `NOT SCHEDULED` | `weekOf = null` (`publishState = NONE`) | `rgba(244,242,238,.65)` |
| `CAPTION TO APPROVE` | scheduled, `captionApprovedAt = null` | `#ffa08a` |
| `READY FOR SLACK` | `captionApprovedAt` set, `postedToSlackAt = null` (`publishState = READY`) | `#f4f2ee` |
| `POSTED TO SLACK` | `postedToSlackAt` set (`publishState = POSTED`) | `#7fe0a6` |

`POSTED` is terminal. Slack is push-only in this app — `lib/postWeek.ts` sends through the incoming webhook and reads nothing back — so the portal never learns the client's ✅. Do not design or build a "client approved" state on the board; that conversation lives in the channel. (This supersedes the reaction-driven wording in `README.md`.)

**Drag.** HTML5 drag. Tray → day schedules it: writes `weekOf` (day + time, default 10:00), defaults channels to IG, and lands on `CAPTION TO APPROVE` unless the caption is already approved. Day → day moves it. Anything → tray clears `weekOf` and returns it to `NOT SCHEDULED`. Every drop toasts with `UNDO` and the undo restores the previous day, time, channels and state. Dropping a card that was in the tray also selects it, so the caption is one glance away.

**Caption sheet.** Right sheet, `min(400px,100vw)`, `--s0`, 1px `--rule` left border, `v3sheet` 500ms `--edrawer`, scrim `rgba(0,0,0,.45)`. Closes on scrim click or Esc. Contents in order: state pill + `Saved` fade + `ESC ✕` · 16/9 poster with a play mark · `{filename} · {client} · {project}` and the specs line · `TITLE` (serif 24px input, writes `contentTitle`) · `GOES OUT` / `CHANNELS` pair on `--s1` · `CAPTION · INSTAGRAM` with `AI DRAFT · NOT APPROVED` in `--warn` when `captionSource = AI`, 13px textarea, `{n} / 2200` counter that turns `--warn` over the limit, `DRAFT FROM TRANSCRIPT` (writes an AI caption and drops the card back to unapproved) · `CAPTION · YOUTUBE`, optional · then one of:

- `APPROVE CAPTION` — full-width primary. Sets `captionApprovedAt`, `captionSource = HUMAN`, and `READY` if the card is on a day. Toast with `UNDO`. Shown only when there is caption text to approve.
- A status strip in 1px `--rule2`: `ADD A CAPTION, THEN A DAY` · `READY · GOES IN THE WEEK POST` · `POSTED · APPROVALS HAPPEN IN SLACK` · `CAPTION READY · DRAG ONTO A DAY`.

Footnote, 11px `--dim`, one line, per state: unapproved AI draft says an unapproved caption holds the whole week back; posted says posting is one-way.

Editing a caption by hand sets `captionSource = HUMAN` but does **not** approve it — approval is the explicit button.

**Sending the week.** The button is the gate, and it says why it won't go:

| Condition | Label | Style |
|---|---|---|
| captions unapproved | `{n} CAPTIONS TO APPROVE` | `--warn` text, 1px `--warn` border, transparent |
| ready | `POST WEEK TO SLACK →` | `--ink` fill, `--bg` text |
| already posted | `POSTED TO {CHANNEL}` | `--dim` text, 1px `--rule2` |

Pressing it while blocked selects the first unapproved card and toasts `{n} captions still waiting on you`. With nothing scheduled: `Nothing scheduled this week`. With no channel for the client: `Add a Slack channel for {client} under Integrations first`.

Ready, it opens a second sheet — the preview, because posting into a client's own workspace is not something to discover afterwards. Kicker `TO #CHANNEL`, serif title `{project} · Week of Sep 21`, one line per scheduled day exactly as it will read (`Tue Sep 22 · 10:00 — Rooftop, golden hour · IG + YT`) with a right-hand tag (`READY` / `NOT APPROVED` / `POSTED`), then `POST TO #CHANNEL →` and one 10.5px line stating that posting is one-way. After posting: kicker `POSTED`, every line `POSTED`, and a `--ok` strip `POSTED TO #CHANNEL`.

Back it with what exists: `previewProjectWeek(projectId, weekStart)` for the sheet, `postProjectWeek(...)` for the button, `POST /api/admin/slack/post-week`. Surface its five errors as toasts — `not-a-calendar-project`, `nothing-scheduled`, `captions-unapproved`, `slack-not-connected`, `slack-rejected` — using each `detail` string; the client's channel resolves `ClientChannel.channel || SlackConfig.defaultChannel`.

## D12 · Reports — `/admin/reports`

The only surface where views appear, and the only one designed to leave the building as paper.

**Frame.** `max-width:1100px`, `padding:44px 40px 140px`. Controls row above the sheet: client chips left (one per client, accent dot), `4W · 8W · 13W` right, then `SAVE PDF` as an `--ink` button. Controls are dark-theme chrome; the sheet below is always light.

**The sheet.** Literal paper: `background:#f6f4f0`, `color:#17161a`, `padding:56px 64px`, `box-shadow:0 30px 80px rgba(0,0,0,.45)`. It does not follow the admin theme — it is what prints. Fixed inks inside: `#17161a` rules and text, `#6e6b66` secondary, `#8a877f` labels, `#dcd8d1` hairlines, `#eeebe5` stat tiles.

- **Masthead.** 3px top border in the client accent; kicker `BJUR MEDIA · DELIVERY & REACH` in the accent; client name serif 400, 48px; right column 11px: date range and `Prepared {date}`.
- **Five stats**, `gap:2px` on `#eeebe5`: `REELS DELIVERED`, `FILMS`, `STILLS`, `POSTS PUBLISHED`, `VIEWS`. Serif 34px figure, 10px `.1em` label. All five are scoped to the selected range, and each label agrees with its own figure — `1 FILM`, not `1 FILMS`. This sheet goes to the client as a PDF; a mismatched plural reads as unfinished typesetting.
- **Platform table.** `PLATFORM · POSTS · VIEWS · MEDIAN`, one row per connected `SocialAccount`. Never render a platform the client has no account for.
- **Most watched.** Four rows: 28px 9/16 thumb, name, `{platform} · {date}`, serif 18px view count. Only posts inside the range.
- **By week.** Two bars per week — delivered in `#cfcbc3`, views in the accent — 120px tall, `title` tooltips carrying the real numbers, week-start labels beneath.
- **Footer.** One 10px line saying where the numbers come from: the client's connected accounts, matched to delivered files.

Numbers come from `SocialPost` (`viewCount`, `postedAt`, `assetId`) joined to delivered `Asset` rows; delivery counts come from the portal. Unmatched posts (`matchConfidence = null`) are excluded — a report should only claim what Bjur delivered.

**Empty state.** Clients with no `SocialAccount`: a dashed `--rule2` box, `No Instagram or YouTube account connected for {client}.` / `Views come from the client's own accounts.` and `CONNECT ONE →` to `/admin/integrations`. The sheet is not rendered at all.

**Print.** `SAVE PDF` opens the browser print view. The sheet is already the page: keep it one sheet at Letter, hide the dark chrome, and don't re-flow it.

## Build notes

- The three screens share the nav component; make it one component with an active-route prop rather than three copies.
- Today, the board and reports each need one endpoint returning exactly what the screen renders. Don't reuse the old dashboard payload — it carries stats and feeds these screens don't show.
- Retire from the old dashboard: stat tiles, the media table's calendar, and the "views" blocks anywhere outside `/admin/reports`.
- e2e worth adding: `board-post-week.spec` (unapproved caption blocks the post; approve, post, second post refused as already posted), `today-dismiss.spec` (dismiss + undo), `reports-empty.spec` (client without accounts).

## Open questions

1. **`LIBRARY` and `TEAM` are out of the nav.** Both routes still exist and are still needed occasionally. Where do they live — an overflow menu on the right, a link at the foot of Today, or back in the nav as a second tier?
2. **Today's dismissals** are per-admin and hidden-not-resolved. With two staff logins, does dismissing hide the item for everyone or only for you? The prototype assumes only you, stored per user.
3. **Board scope.** The prototype filters by project chip and posts one project's week. With several calendar projects for one client, should `ALL` be able to post them as one message per project, or stay one project at a time?
4. **Project expiry.** v2's Today had an `expiring` item; it is not in the v3 endpoint list because nothing was decided about it. The client still gets the expiry reminder email. Does the studio want an admin-side item as a project nears `expiresAt`, or is the client's email enough?
