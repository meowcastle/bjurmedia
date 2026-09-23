# Film projects and the review screen (v4)

Date: 2026-09-23. Prototypes: `prototypes/Bjur Review v1.dc.html` (the review screen, client and studio side) and `prototypes/Bjur Client Project Flow v4.dc.html` (FLOW v4 · FILM: create sheet, admin project page, Today). Where these disagree with any earlier file, v4 wins.

## Why a third type

Delivery and Social calendar are for short work that is handed over or posted. Music videos and narrative color work are different: one piece goes through numbered cuts, several people give notes against the timeline, and the studio answers every note with the next cut. Timestamped feedback exists **only** on Film projects. Delivery loses its review option entirely.

| Type | What it is | Feedback |
|---|---|---|
| Delivery | Clips, stills, masters handed over | None. Files land, seats are emailed, they download. |
| Social calendar | Ongoing reels → week board → Slack | In Slack, never read back (unchanged). |
| **Film** (new) | One piece, cut by cut | Timestamped notes from every reviewer; studio answers each note in the next cut's email; an owner approves the final cut. |

## The loop

1. **Cut goes up.** A non-internal export lands in the Film project inbox → proxy ready → a new round (`Review`, `version = n`) is created **unsent**. Nobody is emailed yet.
2. **Studio answers and sends.** Today shows "Cut n is up · answer k notes". The studio opens the review screen, marks every sent note on cut n−1 **Changed** or **Kept as is** with an optional one-line answer, previews the email, and sends. Cut 1 has nothing to answer: preview and send.
3. **Reviewers are emailed** (every active reviewer, seats and guests) with the cut and the full list of answered notes.
4. **Reviewers watch and note.** Each note is pinned to a time. Notes are private drafts until that reviewer presses **Send N notes to Bjur**; one send = one batch = one staff email. Anyone can send more batches while the cut is current.
5. **Repeat** from 1 until an owner seat presses **Approve cut n**. Approval unlocks master downloads.

Nothing in this loop is answered inside the app by the studio: answers travel only in the next cut's email and then show under each old note on the review screen. No threads, no replies, no reactions.

## Review screen

Route: seats `/p/[projectId]/review` (session); guests `/r/[token]` (no account). Admin: `/admin/projects/[id]/review`. One component, two modes (`client`, `studio`). Always dark (like the viewer), no portal nav.

### Layout
- **Header row**: serif "Bjur" · file title (mono 12) over "Client · Project title" (mono 10.5 dim) · cut tabs right-aligned (`CUT 1 / CUT 2 / CUT 3`, sub-label: date, `Latest`, `Approved`, or for an uploaded-but-unsent cut in studio mode a dashed tab "Not sent yet", disabled) · who's viewing (name · role).
- **Player column** (flex 1, black): the cut at its native aspect (`asset.width/height`; the example is 3840×1606), max-width 1180. Top-left `CUT n`. Studio mode burns in SMPTE timecode top-right. Click frame = play/pause. While playing, a note within [t−0.3s, t+3s] shows bottom-left over the frame (time + body).
- **Transport**: 38px play button · `m:ss / m:ss` (studio: `HH:MM:SS:FF`) · scrubber with note markers. Marker = small square on a stem at `t/duration`. Colors: current reviewer's sent note filled `--acc`; own draft hollow `--acc`; previous cut's notes 6px hollow `--dim2`; active marker grows to 10px. Hover shows a time tooltip. Clicking a marker or a note seeks and pauses.
- **Composer** (client mode, latest cut, not approved): `@ 1:14` chip + input + `ADD ↵`. **Focusing the input pauses the video and locks the timestamp**; the chip turns `--acc`. Enter adds a draft at the locked time and re-locks to the current time for the next note. Esc clears and blurs. On an old cut or after approval the composer is replaced by a dashed line: "Notes go on the latest cut. Go to cut n →" / "Cut n is approved. Reopen for notes".
- **Notes panel** (right, min 340px, wraps below the player when narrow): serif "Notes" + `CUT n · k UNSENT` (client) or `CUT n · k NOTES` (studio). Optional one-line banner (see states). List sorted by time. Below it, `CUT n−1 NOTES · k CHANGED`: the previous cut's notes, each with its outcome (`CHANGED` in `--ok` / `KEPT AS IS` in `--mut`) and the answer text. Footer holds the one primary action.

### Note row
`time` (client 44px col, studio 88px) · body (13px) · meta line: `Draft · only you` + Delete for own drafts; otherwise `Name (you) · sent 4:20 PM`, or on old cuts `answered in cut n+1`.

### Client footer states
| Condition | Footer |
|---|---|
| Own drafts > 0 | Primary `Send N notes to Bjur` (`--acc` fill). Line: "Only you can see these until you send. Keep adding as you watch." |
| No drafts, nothing sent by anyone | Primary `Approve cut n` (`--acc`). Lead "Nothing to change?" |
| No drafts, notes already sent | Secondary `Approve cut n` (outline). Lead "Happy with it after all? Approving tells Bjur cut n is final." |
| Approved | `● Cut n approved` + Undo |
Banner after sending: "Your notes went to Bjur at 4:20 PM. Everyone gets one email when cut n+1 is up, with every note answered."

**Approve is owner-seat only.** Guests and non-owner seats never see the approve button (the prototype shows it for everyone; the build must not). If an owner approves while others have unsent drafts, those drafts stay unsent.

### Studio footer states
| Condition | Footer |
|---|---|
| Latest sent cut, no newer upload | `MARKERS FOR YOUR EDIT`: Premiere (.csv) · Resolve (.edl) · Copy (text). Hint: "Next you'll answer each note. Every reviewer gets cut n+1 and your answers in one email." In the real app there is no upload button here; cuts arrive through the inbox. |
| Newer cut uploaded, unsent (addressing) | Header "Answer cut n notes". Banner "Cut n+1 uploaded. Answer each note on cut n. They go out in the cut n+1 email." Each note gets `CHANGED` / `KEPT AS IS` segmented buttons and an input ("What you did (optional)" / "Why it stays (reviewers read this)"). Footer: `k of N answered` + progress bar (`--ok`) + `Preview cut n+1 email →`, disabled with "Answer N more notes to continue" until every note has an outcome. |
| Email preview | Modal: TO (all reviewer emails), SUBJECT, then the email exactly as sent (see Email). Buttons `← Back to notes` / `Send to N reviewers`. |
| Approved | `● Approved by {name}` · banner "Deliver the master from the project page." |

Studio mode shows **sent notes only**. Draft bodies are never returned by any admin API.

### Keyboard
Space play/pause · N focus composer · ←/→ ±1s (Shift ±5s) · M next marker · Esc clear composer / close preview. Ignore all shortcuts while an input has focus.

### Timecode
Store `timeSec` as a float (ms precision) from `video.currentTime` at the moment the composer is focused. Clients see `m:ss`. Studio sees `HH:MM:SS:FF` using the asset's frame rate (fall back to 23.976 if unknown). Exports use the same frame math.

## Email: cut ready (`emails/cutReady.tsx`, replaces `reviewRequest.tsx`)
Light paper card in the `Bjur Emails v2` system.
- To: every active reviewer (one send each; guests get their tokenized link).
- Subject `{asset title} · cut {n} is ready`.
- Kicker `FOR YOUR REVIEW · {CLIENT}` in the client accent. Headline serif 38 `Cut {n} is ready.`
- Body: "Went through all {N} notes on cut {n−1} from {names}. {Every one is changed. | X changed, Y kept, with the reason below.} Watch it, then approve or send more notes." Cut 1: "Watch it, then approve or send notes."
- Rows (one per sent note on cut n−1, by time): `m:ss` · "note body" · by Name · `CHANGED`/`KEPT AS IS` label + answer (Changed with no answer prints "Done.").
- CTA `WATCH CUT {n} →` → review route at the new cut.
- Footer line: "Leave notes right on the video. They reach Bjur when you press send."

## Email: notes in (`emails/notesIn.tsx`, replaces `feedbackReceived.tsx`)
To staff, once per reviewer batch. Kicker `NOTES · {CLIENT}`, headline "{Name} sent {N} notes on cut {n}.", then the rows (time + body), CTA `OPEN REVIEW →`. Approval sends the same template with headline "{Name} approved cut {n}."

## Admin project page (Film)
Same shell as Delivery (title, facts, what it does, payment, footage requests). Film adds a two-column block above SENT TO BJUR:
- **CUTS · n** + `OPEN REVIEW →`. Rows newest first: serif `Cut n` · "k notes from Adam, Mia" / date · status (`k IN · REVIEWING` in `--warn` + `OPEN →` on the latest; `ANSWERED IN CUT n+1` dim on older; `APPROVED` in `--ok`). Empty: "No cuts yet. The first export you drop in the inbox becomes cut 1, and every reviewer is emailed to watch it."
- **REVIEWERS · n** + `+ ADD` (email → invite; guest link is sent with the next cut, or immediately if a cut is live). Rows: name · `SEAT` / `GUEST LINK` · role · status for the latest cut: `Sent N notes · 4:02 PM` (`--ok`), `Watched · drafting` (has drafts; count only), `Not opened yet`, `Invited · link sent`. Footnote: "Client seats review automatically. Guests get a link and give their name once; no account, no downloads."
- "What this project does" for Film: each upload is a new cut and every reviewer is emailed; reviewers leave timestamped notes and send in one batch; you answer every note before the next cut goes out; approval unlocks master downloads.

## Create sheet
Type is three radio cards: Delivery (default) · **Film** (`CUTS & NOTES`) · Social calendar. The "Review before it's final" toggle is removed. When Film is picked, a REVIEWERS block appears under the title: "{seat names} review as seats. Add anyone else below; they get a link, no account." + a guest email input (comma or space separated). "Add to it" keeps only "Start with a footage request". Footnote: "Type is fixed after this. Reviewers, title, payment and footage requests can change any time." Done note: "Drop the first export in the inbox. It becomes cut 1 and every reviewer is emailed to watch it."

## Today
Replace the `feedback` kind with:
- `notes-in` — per reviewer batch. Subject `{project} · cut n`, quote = first note, body `{Name} · {role} · {time} · {others} still reviewing`. Action `OPEN REVIEW`, dismiss `HANDLED`.
- `cut-ready` — a new cut is up and unsent. Subject `{project} · cut n is up`, body `Answer k notes on cut n−1, then send`. Action `ANSWER NOTES`.
- `approved` — `{Name} approved cut n`. Action `OPEN PROJECT` (deliver the master).
Activity log lines: "{Name} sent N notes on {title} cut n", "Mail: {title} cut n sent to N reviewers · k notes answered".

## Client portal entry (not drawn)
A Film project in the client's project list opens the review screen at the latest sent cut. After approval it opens the normal Delivered gallery (D3) with the master; the review screen stays reachable from a `CUTS` link. Guests only ever see the review screen.

## Open decisions (defaults stated; change if you disagree)
1. **Unsent drafts when the next cut goes out**: stay on the old cut, visible only to their author with "Not sent · cut n closed". Not carried forward, not auto-sent.
2. **Answer required for "Kept as is"**: optional (prototype). Recommended to require it; one line in the validator.
3. **Existing `review = true` Delivery projects** (e.g. Space Invaders reels) become Film in the migration. If some should instead lose review, list them before migrating.
