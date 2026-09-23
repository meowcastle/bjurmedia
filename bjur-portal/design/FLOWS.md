# Flows

## 1. Calendar → Slack (57.NYC pattern)
1. Reels land in the project inbox → worker makes proxy + thumb → if `client.autoCaption`, transcribe + draft caption (`captionSource: AI`). Asset appears in the board **tray** ("Unscheduled").
2. Admin drags the card onto a day → `weekOf` set, state `DRAFT` (or `READY` if a human caption already exists). Toast with undo.
3. Admin opens the card (side sheet): title, publish time, channels, IG caption (AI-flagged until edited), YT caption. **Approve caption** → `READY`. Sheet primary then reads **Post week to Slack →**.
4. **Post week to Slack** (board button): scope is one project's week. Preview sheet lists that project's scheduled cards with the target channel (`ClientChannel.channel || SlackConfig.defaultChannel`). Refuses while any caption is unapproved (`captionApprovedAt = null`) — "N captions not reviewed yet" — and refuses a week already sent. Post → cards `POSTED`; one Slack message per week per project, one line per day.
5. **Slack is push-only.** The webhook sends; nothing is read back — no bot token, no reaction polling. The client's ✅ or "can we change this" happens in the channel, and the portal never learns of it: `POSTED` is where calendar work stops. If a client asks for a change, staff edit the card and post the week again.
6. Nothing posts on its own. Nothing auto-approves.

## 2. Film review (v4 — replaces "Review & feedback")
Full spec: `SCREENS-FILM-REVIEW.md`. Only FILM projects have review.
1. Non-internal export lands → proxy ready → `Review` version n created with `sentAt = null`. No mail. Today item `cut-ready`.
2. Studio opens the review screen: every sent note on cut n−1 gets `outcome` CHANGED/KEPT + optional `response`. Send is blocked until all have an outcome. Preview email → send → cut n `sentAt = now`, cut n−1 `SUPERSEDED`, `cutReady` mail to every non-revoked Reviewer. Cut 1 skips answering.
3. Reviewers (all client seats + guests by link) watch; focusing the composer pauses and locks the time; notes are private drafts until **Send N notes** → `sentAt` on that reviewer's drafts → one `notesIn` mail to staff + Today `notes-in`.
4. Owner seat **Approve cut n** → `APPROVED`, `notesIn` (approved variant) to staff, Today `approved`, master downloads unlock. Undo reopens (`PENDING`) while no newer cut exists.
5. Studio never replies in the app. Answers live only in the next cut email and under each old note on the review screen.
6. Markers: `GET /api/admin/reviews/[id]/markers?format=csv|edl|txt` — sent notes only, SMPTE at the asset frame rate. CSV columns match Premiere's marker import (Marker Name = reviewer name, Description = body, In = Out = timecode, Marker Type = Comment). EDL = CMX3600 with `* LOC:` lines.
7. No deadlines, no reminders, nothing auto-approves.

## 3. Footage requests (submissions)
A project has 0–n **submission requests**. Admin: project page → "+ Request footage" → one field ("What are they sending?") → link `bjurmedia.nyc/send/<project>/<name>-<token>`, 14-day expiry, own folder `submissions/<name>/` inside the project. Copy / Close / Reopen per request. Can also be created at project creation ("Start with a footage request").
Send page needs **no login**: header `BJUR / {client}` only, optional "Who's sending?" name field, body = existing `SubmissionUploadClient` (drop zone, per-file progress, pause/resume, 16 MB chunks, resumable). Closed or expired → 404 page in the same style. Logged-in clients reach the same page from "↑ Send more" in the project's **Sent to Bjur** section.
Batch complete → staff alert email + Today item "Upload landed · {request name}" (Open folder / Pulled).

## 3b. Project shape
Three types, fixed at creation: **Delivery** (a gig you hand over, no review), **Film** (cuts and timestamped notes, see §2) and **Social calendar** (ongoing; reels → board → Slack). There is no separate Review feature any more; review is what Film is. One optional extra at creation: start with a footage request.

## 4. Viewer (client)
Keep `useMediaCarousel` (drag track, overdamped settle, tap-to-toggle chrome). Changes:
- No arrow buttons. Swipe/drag only; keyboard ←/→ on desktop. Track follows the pointer 1:1, commits past 22% of width or velocity > .5 px/ms, rubber-bands at ends (×.25). Settle 380ms `cubic-bezier(.2,.8,.2,1)`. Never re-render on pointermove — mutate the track transform directly.
- Chrome: top = "n / N · WEEK OF …" and "ESC ✕"; bottom = post block (when the asset has a publish/review record: date/state line, serif title, caption), scrubber with mono times, play/mute chips, "↑ DOWNLOAD". Filename removed from chrome. Mobile: top bar padding-top 58px (status bar), bottom padding 44px (home indicator).
- Double-tap (< 320ms) toggles favorite: heart burst center (700ms), small heart top-right shows state. Single tap toggles chrome (debounced 260ms so double-tap doesn't flicker).
- Swipe up / ↑ / DOWNLOAD chip lifts the clip 6vh and slides the **download sheet** from the bottom (500ms drawer easing): filename, specs, one download button with live % (resumable), and the hold line when the project is held for payment. No licensing, no tiers, no price — see `SCREENS-D3-D4-D7.md` (D4). Sheet width `min(560px, 100%)`.
- Preview mark on downloads while the project is held for payment (`Asset.markStatus`). Nothing is hidden — only marked.

## 5. Selection & download
Tile click opens the viewer; the checkbox (top-left) selects. Selection bar fixed bottom-center: "N selected · size", Clear, ♥ Favorite, Download N. "Select week" per week header. Download all shows shimmer + live bytes, then "Saved · file.zip" green for 2.8s.

## 6. Today (admin)
`GET /api/admin/today` returns ordered items: `cut-ready`, `notes-in`, `approved`, `caption-to-approve`, `upload-landed`, `encode-failed`. (`feedback` is removed.) Each has subject, body, optional quote, primary action + dismiss label. Dismiss with undo. Copy for the Film kinds is in `SCREENS-FILM-REVIEW.md`.

## 7. Create sheets (admin, right side, 440–460px)
**Project**: client chips · type (Delivery default / Film / Social calendar) · title → inbox path preview · **Film only:** reviewers (seat names listed, guest emails input) · Add to it: Start with a footage request · expires · payment Clear/Hold → done state. The Review toggle is gone.

## 8. Theme
Toggle in each header ("☾ DARK" / "☼ LIGHT"). Persist per portal. All colors via tokens (README). Thumbnail overlays and the viewer are theme-independent.

## 9. Responsive (client)
Breakpoint 720px. Under it: header padding 14/18, hide user name; deliveries single column, hero 4:5, index rows hide delivered/contents columns; project header stacks, week rail becomes filter chips only, week title 24px, post action buttons go full-width in a row, file grid `minmax(104px,1fr)` gap 8; selection bar `calc(100vw - 24px)` at 12px; login single column. Admin: build responsively; board = one day per screen, swipe between days; nav = menu button.

## 9b. Client page & Integrations (admin)
Client page: header, one quiet facts line (`SLACK #… · N ACCOUNTS · AI CAPTIONS — MANAGE →` or `NO INTEGRATIONS — ADD →`; owner; accent click-to-reveal), then Projects (type badge, meta, flag: HELD FOR PAYMENT / AWAITING FOOTAGE / EXPIRES … / date) and Seats. Nothing else. `/admin/integrations`: one table, all clients — Slack channel, accounts, AI captions, OPEN →. The only place integrations are edited.

## 10. Copy rules
One line per control, say what it is or what to do. No process explanations. Labels uppercase mono. Toasts confirm every mutation; include Undo where reversible.
