# Audit: live code vs. v3 project model

> **v4 addendum (2026-09-23): section G adds the Film project type.** It changes B2 (`Project.review` is dropped, not kept), E1 (moot: review no longer exists outside Film) and the review loop in A. Build G after F.

Date: 2026-09-21. Against `bjur-portal/` at the mounted working copy (last migration `20260920150309_add_payment_hold_watermark`).
Reference prototype: `prototypes/Bjur Client Project Flow v3.dc.html` (FLOW v3.5).
D3, D4 and D7 are drawn; their spec is `SCREENS-D3-D4-D7.md`. Today, the week board and reports are drawn as of 2026-09-22 (D10–D12); their spec is `SCREENS-TODAY-BOARD-REPORTS.md`. Every admin nav item now has a screen.

## Verdict

**Ready to build; ship as one release.** All decisions closed (section E). The v2 work already in the repo is solid (Review model, payment hold + marked renditions, Integrations page, Submission upload client). But the code still models the *old* project shape — five independent booleans, editable forever, plus a licensing layer we have since removed. Pushing the v3 UI on top of that schema would leave three dead systems running (licensing, auto-approve, weekly cron). Do the schema pass first (~1 migration), then the UI.

Estimated scope: 1 migration, ~14 files touched, ~9 files deleted, 6 e2e specs retired, 3 new.

**Update 2026-09-22 — section B has landed.** The working copy carries `20260921100000_v3_project_shape`: `ProjectType`, `SubmissionRequest`, `UploadBatch.senderName` + nullable `userId`, `MarkStatus`, and `PublishState.READY` / `POSTED` (the latter documented in the schema as terminal, because Slack is push-only). The schema is no longer the blocker; the remaining work is the UI in section D and the deletions in section C.

---

## A. Already matches v3 — keep

| Area | Where | Note |
|---|---|---|
| Payment hold + watermark pipeline | `Project.paymentHold`, `Asset.mark*`, `lib/paymentHold.ts`, worker `[mark]` loop | Exactly the "hold is a state, not a type" model. Client copy on `ProjectDetailClient` ("These files carry a BJUR MEDIA watermark…") is close to spec; see D3 for wording. |
| Review loop | `model Review`, `lib/reviews.ts`, `reviewMail.ts`, `emails/reviewRequest.tsx`, `feedbackReceived.tsx`, `ClientReviewPanel` | Done. Only change: `review` becomes immutable after creation (B2). |
| Client-level integrations | `Client.autoCaption`, `captionStyle`, `ClientChannel`, `SocialAccount`, `/admin/integrations` page | Correct level. Page needs the one-table-all-clients layout (D5). |
| Resumable submission uploads | `SubmissionUploadClient`, `UploadBatch`, `Submission`, 16 MB chunks | Keep the client wholesale. It gains a token-based entry (B4). |
| Manual post-week | `lib/postWeek.ts`, `AdminMediaCalendar.postWeek()`, `POST /api/admin/slack/post-week` | Done. Remove the cron path beside it (C3). |
| Client memberships | `ClientMember` | Unaffected. |

## B. Schema changes (one migration: `v3_project_shape`)

1. **`Project.type` enum `DELIVERY | CALENDAR`**, replaces `calendar Boolean`. Backfill: `calendar = true → CALENDAR`, else `DELIVERY`.
2. **`Project.review` stays** but is write-once: `PATCH /api/admin/projects/[id]` must reject changes to `type` and `review` (400 "Set at creation"). Only `title`, `status`, `deliveredAt`, `expiresAt`, `paymentHold` are patchable.
3. **Drop `Project.clientUploads`** and **`Project.sellMasters`**. Migration drops both columns.
4. **New `SubmissionRequest`** (the "send link"):
   ```prisma
   model SubmissionRequest {
     id         String    @id @default(cuid())
     projectId  String
     project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
     name       String              // "Berlin raws" — also the on-disk folder name
     token      String    @unique   // URL token for /send/<projectSlug>/<name>-<token>
     expiresAt  DateTime            // default now + 14d
     closedAt   DateTime?
     createdAt  DateTime  @default(now())
     batches    UploadBatch[]
     @@index([projectId])
   }
   ```
   `UploadBatch.requestId String?` → relation; `UploadBatch.userId` becomes **nullable** (anonymous senders). `submissionRelPath()` in `lib/submissions.ts` nests under `<request.name>/`.
5. **Drop licensing**: `model License`, `enum LicenseTier`, `Asset.licensable`, `Asset.basePrice`. `Client.licenses`, `User.licenses`, `Asset.licenses` relations go with them. Masters that were `licensable` become `internal = true` in the migration so nothing new leaks to clients.
6. **Drop auto-approve**: `Client.approvalRequired`, `Client.approvalAutoHours`, `Asset.approvalDueAt`, `Asset.heldAt`, `Asset.approvalRemindedAt`. `PublishState` loses nothing; `AWAITING` now only means "in the Slack post".
7. **Drop cron fields**: `SlackConfig.weeklyDay/weeklyTime/autoWeekly/autoContentCalendar/autoLicense`, `ClientChannel.autoPostSlack/autoPostDay/autoPostHour/lastPostedAt`, and all of `SocialConfig` except `youtubeApiKey` (digest dropped, E2). Also `User.notifyWeekly`, `Client.notifyWeekly`.
8. **`UploadBatch.senderName String?`** — optional name typed on the public send page (E7).

## C. Delete (dead after B)

| File | Why |
|---|---|
| `components/MasterSheet.tsx`, `LicensingDialog.tsx`, `GrantLicenseDialog.tsx` | Licensing gone. `VideoViewer`'s swipe-up becomes a plain download sheet (D4). |
| `lib/licensing.ts`, `api/licenses/route.ts`, `api/admin/licenses/route.ts`, `emails/license.tsx` | Same. |
| `emails/approval.tsx`, `emails/weekly.tsx`, `components/WeeklyDigest.tsx`, `lib/approvalMail.ts`, `worker.ts → startApprovalReminderScheduler()`, the auto-approve sweep and the weekly digest scheduler | No auto-approve; digest dropped (E2). |
| `worker.ts` weekly Slack cron (`autoWeekly` block, lines ~224–240 and ~303–320) and per-client `autoPostSlack` scheduler (~246–280) | Posting is manual from the board. |
| `components/EditProjectDialog.tsx` | Replaced by inline edit on the project page (D2). |
| `components/ClientSubmissionsDialog.tsx` | Replaced by the "Sent to Bjur" section (D2). |
| `AdminSocialIntegrationsClient.tsx` weekly-digest controls | Fold into `AdminIntegrationsClient` (D5). |
| e2e: `licensing`, `admin-licensing`, `master-sheet`, `sell-masters(+harness)`, `approval-mail(+harness)`, `client-approval`, `client-uploads-optin`, `submissions-dialog`, `project-services` | Test removed behavior. Replace with D7. |

## D. Build

1. **New project sheet** (`NewProjectDialog.tsx` → right-side sheet per FLOWS §7). Fields in order: client chips · type (2 radio cards, Delivery default) · "Add to it": Review, Start with a footage request · title with inbox path preview · expires · payment (Clear / Hold). Calendar is blocked with "Add a Slack channel for {client} under Integrations first" when `ClientChannel` is missing. `POST /api/admin/projects` body: `{ clientId, title, type, review, startRequest, expiresAt, paymentHold }`.
2. **Project page (admin)** `/admin/projects/[id]` — currently no such route; projects are edited from the client page dialog. Build it per prototype: type badge ("DELIVERY · REVIEW · set at creation"), inline-editable title / delivered / expires (blur or Enter saves, Esc reverts, toast), facts row (files · received), "What this project does", Payment card (Hold ↔ Release), **Sent to Bjur** list with + Request footage (name → link), Copy / Close / Reopen per request. Footer: delete only when the project holds no assets and no submissions; otherwise "Holds N files · empty it to delete."
3. **Client project page** (`ProjectDetailClient.tsx`) — drawn; spec in `SCREENS-D3-D4-D7.md`:
   - Split into **Delivered** (assets) and **Sent to Bjur** (submission requests with counts; "↑ Send more" opens the upload client for an open request).
   - Hold copy: replace the paragraph at ~L651 with one line under the header, "Downloads carry a preview mark until the invoice is settled." Same line in the viewer's download sheet. No red, no lock glyph.
   - Remove `LicensingDialog` import/usage (~L16, L853).
   - Delete `approvalDueAt` / `heldAt` props and the "Auto-publishes…" line in `ClientPostsPanel` (~L135).
4. **Viewer** (`VideoViewer`, `VideoChrome`, `AssetTile`) — drawn; spec in `SCREENS-D3-D4-D7.md`: remove `locked`/`licensable`/"Unlock master". Swipe-up sheet = filename, specs, one download button with live %, and the hold line when `paymentHold`. `AssetTile` price badge (~L88) goes.
5. **Integrations page** (`AdminIntegrationsClient.tsx`): one table, one row per client: accent · name · Slack channel (input or "+ CHANNEL") · connected accounts · AI captions toggle · OPEN →. Workspace status in the header. Remove weekly cron controls, `autoContentCalendar`, `autoLicense`. Keep `autoUpload` / `autoSubmission` event toggles if still wanted, moved below the table.
6. **Client admin page** (`AdminClientDetailClient.tsx`): remove the per-project service toggles (~L932–960), the approval-hours field (~L183–202, ~L817), the auto-caption / house-style / Slack cards on the right. Right column = Seats only. Under the header, one quiet facts line: `SLACK #57NYC-CONTENT · 2 ACCOUNTS · AI CAPTIONS — MANAGE →` or `NO INTEGRATIONS — ADD →`. Accent as click-to-reveal swatches.
7. **Public send page** `/send/[projectSlug]/[nameToken]` — no session. Drawn; spec in `SCREENS-D3-D4-D7.md`. Resolves `SubmissionRequest` by token; closed or expired renders the page shell with "This link is closed." rather than a bare 404. Brand line is `BJUR` in serif with the client name beneath — no header, no nav, dark always. Body: the existing `SubmissionUploadClient` bound to the request, with an optional sender name below the dropzone once files stage. Logged-in clients reach the same page from "↑ Send more". Today item "Upload landed" names the request and the sender.
8. **Ingest / Today**: `deliveryNotify.ts` drops the `braw` count (~L111). Today gets `upload-landed` items per request batch.
9. **e2e**: `project-create-types.spec` (two types, calendar blocked w/o Slack, review immutable via PATCH), `submission-request.spec` (make link → anonymous upload → close → 404 → reopen), `project-inline-edit.spec`.
10. **Today** `/admin` — drawn; spec in `SCREENS-TODAY-BOARD-REPORTS.md`. Replaces the stats-and-feeds dashboard with one needs-you list (feedback · upload landed · caption to approve · encode failed), the `Activity` log, and a three-dot status line (`WorkerHeartbeat`, `SlackConfig`, `SocialAccount.tokenExpiresAt`). Dismiss is per-admin, reversible, and changes no record. Item actions deep-link into `/admin/projects/[id]` and the board with a card selected.
11. **Week board** `/admin/board` — drawn. Tray + 7 days, drag writes `Asset.weekOf`, caption sheet approves with `captionApprovedAt` + `captionSource`, and the post button is the gate: it shows `{n} CAPTIONS TO APPROVE` until the week is clean, then opens a preview sheet built from `previewProjectWeek()` before calling `postProjectWeek()`. Surface all five `PostWeekResult` errors as toasts. No client-approval state on the board — posting is one-way.
12. **Reports** `/admin/reports` — drawn. Client chips + 4W/8W/13W, one always-light paper sheet (masthead, five range-scoped stats, platform table per connected `SocialAccount`, most-watched four, two-bar-per-week chart, source footer), print as-is. Exclude `SocialPost` rows with `matchConfidence = null`. Clients without accounts get the dashed empty state, no sheet.

## E. Decisions — closed 2026-09-21

1. **Review + Calendar**: rejected. `POST /api/admin/projects` returns 400 "Calendar posts are approved in Slack" when `type=CALENDAR && review=true`. The create sheet disables the Review toggle when Calendar is picked, with that line as the hint.
2. **Client weekly digest email**: dropped. Delete `emails/weekly.tsx`, `components/WeeklyDigest.tsx`, `SocialConfig.weeklyDay/weeklyTime/autoWeekly/lastWeeklyDigestOn`, the worker digest scheduler, and `User.notifyWeekly` / `Client.notifyWeekly`. Client Settings loses the "Weekly digest" toggle (leaves New delivery, Review requests, Expiry reminder).
3. **Send-link TTL**: `SUBMISSION_REQUEST_TTL_DAYS`, default 14. Reopen extends by the same.
4. **Draft / Live**: auto only, hidden. Keep `Project.status` and the flip-to-LIVE on first asset (it gates client visibility of empty projects). Remove it from `PATCH` and from every admin surface.
5. **Hold release**: email the client's owner seats on release only (`emails/released.tsx`, exists). Never email on hold.
6. **Existing licensable masters**: migration sets `internal = true` where `licensable = true` before dropping the column. Nothing previously locked becomes downloadable.
7. **Send page sender**: optional name field ("Who's sending? — optional"), stored as `UploadBatch.senderName String?`. Today item and staff alert read "Upload landed · Berlin raws · from Marcus" when present.
8. **Release shape**: one release. Old UI never runs against the new schema; branch `v3`, merge when the D-list is complete and the new specs pass.

## F. Order of work

1. Migration B1–B7 + delete C. Run the suite; expect the retired specs to fail, delete them.
2. D1 + D2 + D6 (admin create / project page / client page).
3. D7 + D3 (send page, client project page).
4. D4 + D5 (viewer, integrations).
5. D10 + D11 + D12 (Today, board, reports) — D11 last of the three; it is the only one with new interaction (drag, caption gate, post preview).
6. D9 new specs, plus `board-post-week`, `today-dismiss`, `reports-empty`. Deploy.

## G. v4 — Film projects (2026-09-23)

Spec: `SCREENS-FILM-REVIEW.md`. Schema: `SCHEMA.md` → v4 deltas. Prototypes: `Bjur Review v1.dc.html`, `Bjur Client Project Flow v4.dc.html`.

**Schema** — migration `v4_film`: `ProjectType.FILM`; backfill `review = 1 → FILM`; drop `Project.review`; `Review` gains `sentAt`, `approvedById`, `approvedAt`, `supersededAt`, state `PENDING|APPROVED|SUPERSEDED`; migrate `Review.feedback` into `ReviewNote` then drop `feedback`, `userId`, `respondedAt`; new `Reviewer`, `ReviewNote`, enums `ReviewerKind`, `NoteOutcome`.

**Change**
| File | Change |
|---|---|
| `lib/reviews.ts` | `openReview`: eligibility `type === FILM`; create unsent (`sentAt null`); **remove** the `notifyReviewRequest` call. `respondToReview` replaced by note/send/approve functions below. Keep the per-version idempotency. |
| `lib/reviewMail.ts` | Recipients = non-revoked `Reviewer` rows (seats + guests). `notifyReviewRequest` → `notifyCutReady(reviewId)` (rows of answered notes from the previous cut). `notifyFeedback` → `notifyNotesIn(reviewId, reviewerId, noteIds)` and `notifyApproved`. Keep "never throws". |
| `emails/reviewRequest.tsx` → `cutReady.tsx`; `feedbackReceived.tsx` → `notesIn.tsx` | Per spec. |
| `api/reviews/[id]/respond` | **Delete.** Replaced by the routes below. |
| `components/ClientReviewPanel.tsx` | **Delete.** Replaced by `ReviewScreen`. |
| `app/admin/(app)/page.tsx` + `AdminDashboardClient` | Today kinds: drop `feedback`; add `cut-ready`, `notes-in`, `approved`. |
| `NewProjectDialog` / create API | Third type; guests array; remove review toggle and the Calendar+Review 400. Create SEAT Reviewer rows from `ClientMember` and GUEST rows (token) for guests. |
| Seat add/deactivate | Sync SEAT Reviewer rows on every FILM project of that client. |
| `prisma/seed.ts` | Adam Knights project → FILM "HURT — Music Video", 3 cuts, reviewers Adam (seat, owner), Tom Reyes (guest, Director), Mia Chen (guest, Label); notes as in the prototype. |

**New**
| Path | What |
|---|---|
| `components/ReviewScreen.tsx` | Player + transport + markers + composer + notes panel; `mode: "client" | "studio"`. Reuse the existing proxy player; add `currentTime` capture on composer focus. |
| `app/(client)/(app)/p/[projectId]/review/page.tsx` | Seat entry. FILM projects route here from the project list until approved. |
| `app/r/[token]/page.tsx` | Guest entry, no session. First visit: name field once (writes `Reviewer.name`), then the screen. Sets `lastOpenedAt`. 404 if revoked. No download endpoints reachable. |
| `app/admin/projects/[id]/review/page.tsx` | Studio mode. |
| `POST/PATCH/DELETE /api/reviews/[id]/notes` | Author's drafts. Reject if the round isn't the current sent, unapproved cut. |
| `POST /api/reviews/[id]/send` | Sends the caller's drafts on this round → `notifyNotesIn`. |
| `POST /api/reviews/[id]/approve` · `DELETE` (undo) | Owner seats only (403 otherwise). Undo only while no newer cut is sent. |
| `PATCH /api/admin/reviews/[id]/notes/[noteId]` | `outcome`, `response`. Sent notes only. |
| `POST /api/admin/reviews/[id]/release` | Sends an unsent cut. 409 if any sent note on the previous cut lacks `outcome`. Returns the rendered email for the preview first via `GET …/release/preview`. |
| `GET /api/admin/reviews/[id]/markers?format=csv\|edl\|txt` | Marker export. |
| `POST/DELETE /api/admin/projects/[id]/reviewers` | Invite guest / revoke. |

**Privacy check** — add an e2e that asserts no admin route or Today payload contains a draft body.

**e2e (new)**: `film-create` (three types, guests become GUEST reviewers, review toggle gone) · `film-notes-draft-private` · `film-send-batch-mail` (one staff mail per batch, quoted verbatim) · `film-release-gate` (409 until all answered; cutReady lists every note with outcome) · `film-guest-link` (name once, note, send, revoke → 404, no download) · `film-approve-owner-only` · `film-markers-export`. **Retire**: `dashboard-feedback.spec`, `review-harness` checks on `respondToReview`.

**Order**: migration + seed → reviews/reviewMail + routes → ReviewScreen (studio first, it's the gate) → guest route → create sheet + project page + Today → emails → specs.
