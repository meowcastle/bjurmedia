# Schema deltas (Prisma) — v3

Against `prisma/schema.prisma` at migration `20260920150309_add_payment_hold_watermark`. Everything below is one migration, `v3_project_shape`. Full rationale and file-by-file list in `AUDIT-v3.md`.

## Project
- **Add** `type ProjectType @default(DELIVERY)`; `enum ProjectType { DELIVERY CALENDAR }`. Backfill from `calendar`. **Drop** `calendar`.
- **Keep** `review Boolean` — write-once. `PATCH` rejects changes to `type` and `review`.
- **Drop** `clientUploads`, `sellMasters`.
- **Keep** `paymentHold`, `paymentReleasedAt`, `expiresAt`, `deliveredAt`, `status`.
- **Reject** `type = CALENDAR && review = true` at create (400). Calendar posts are approved in Slack.
- `status` (DRAFT/LIVE) stays, auto-only: flips to LIVE on first asset, never patchable, never shown.
- Patchable after creation: `title`, `deliveredAt`, `expiresAt`, `paymentHold`. Nothing else.

## SubmissionRequest (new)
```prisma
model SubmissionRequest {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String              // "Berlin raws" — folder name under the project's submissions dir
  token     String    @unique   // /send/<projectSlug>/<slug(name)>-<token>
  expiresAt DateTime            // now + SUBMISSION_REQUEST_TTL_DAYS (default 14)
  closedAt  DateTime?
  createdAt DateTime  @default(now())
  batches   UploadBatch[]
  @@index([projectId])
}
```
- `UploadBatch.requestId String?` + relation. `UploadBatch.userId` → nullable (anonymous senders via the link). **Add** `UploadBatch.senderName String?` (optional name from the send page).
- `Submission` (per-file rows) unchanged.
- A request is *open* when `closedAt == null && expiresAt > now`. Reopen = `closedAt = null, expiresAt = now + TTL`.

## Licensing — removed
- **Drop** `model License`, `enum LicenseTier`, `Asset.licensable`, `Asset.basePrice`, relations on `Client`, `User`, `Asset`.
- Migration: `UPDATE Asset SET internal = 1 WHERE licensable = 1` before dropping the column.

## Approvals — auto-approve removed
- **Drop** `Client.approvalRequired`, `Client.approvalAutoHours`, `Asset.approvalDueAt`, `Asset.heldAt`, `Asset.approvalRemindedAt`.
- `PublishState` unchanged: `NONE | DRAFT | READY | AWAITING | APPROVED | CHANGES | POSTED | PUBLISHING | PUBLISHED | FAILED`. `AWAITING` = in the Slack post, no reaction yet.
- Keep `captionApprovedAt`, `postedToSlackAt`. **Add** `slackMessageTs String?` if reaction-reading is built.

## Slack / cron — removed
- **Drop** `SlackConfig.weeklyDay`, `weeklyTime`, `autoWeekly`, `autoContentCalendar`, `autoLicense`.
- **Drop** `ClientChannel.autoPostSlack`, `autoPostDay`, `autoPostHour`, `lastPostedAt`. `ClientChannel` = `{ clientId, channel }`.
- **Drop** `SocialConfig.weeklyDay`, `weeklyTime`, `autoWeekly`, `lastWeeklyDigestOn` (client digest email removed). `SocialConfig` = `{ id, youtubeApiKey }`.
- **Drop** `User.notifyWeekly`, `Client.notifyWeekly`.

## Client
- Unchanged: `accentColor`, `autoCaption`, `captionStyle`, `channel`, `socialAccounts`, `members`. These are the *integrations*; they live on `/admin/integrations` and are optional per client.

## Review
Superseded by v4 below.

## Emails (`src/emails/`)
- **Delete** `approval.tsx`, `license.tsx`, `weekly.tsx`.
- Keep `delivery`, `expiry`, `feedbackReceived`, `onboarding`, `released` (sent to owner seats when a payment hold is lifted; never on hold), `reviewRequest`, `staffAlert`.
- `staffAlert` "upload landed" names the `SubmissionRequest` and, when given, `senderName`.

---

# v4 deltas — Film projects (2026-09-23)

One migration, `v4_film`, after `v3_project_shape`. Screen and flow spec: `SCREENS-FILM-REVIEW.md`.

## Project
- `enum ProjectType { DELIVERY CALENDAR FILM }`.
- Backfill: `UPDATE Project SET type = 'FILM' WHERE review = 1`. Then **drop** `Project.review`. Review exists only on FILM.
- Create: `type` is still write-once. FILM accepts `guests: string[]` (emails) in the POST body.

## Review (one row = one cut)
Keep the model and name to limit churn; `openReview` eligibility changes from `project.review` to `project.type === "FILM"`.
```prisma
model Review {
  id          String      @id @default(cuid())
  assetId     String
  asset       Asset       @relation(fields: [assetId], references: [id], onDelete: Cascade)
  version     Int         @default(1)          // cut number = reingestCount + 1 (unchanged)
  note        String?                           // studio note shown beside the cut (unchanged)
  state       ReviewState @default(PENDING)
  sentAt      DateTime?                         // NEW. null = uploaded, not yet sent to reviewers
  approvedById String?                          // NEW. Reviewer who approved (owner seat)
  approvedAt  DateTime?                         // NEW
  supersededAt DateTime?                        // NEW. set when the next cut is sent
  createdAt   DateTime    @default(now())
  notes       ReviewNote[]
  @@index([assetId])
  @@index([state])
}
enum ReviewState { PENDING APPROVED SUPERSEDED }   // FEEDBACK removed
```
- **Drop** `Review.feedback`, `Review.userId`, `Review.respondedAt` after migrating: each non-empty `feedback` becomes one `ReviewNote` with `timeSec = null` (renders as "General", no marker), `sentAt = respondedAt`, author = the matching Reviewer row.
- Only one Review per FILM project may have `sentAt != null && state = PENDING` (the current cut). Sending cut n sets cut n−1 `state = SUPERSEDED, supersededAt = now`.

## Reviewer (new)
```prisma
model Reviewer {
  id           String    @id @default(cuid())
  projectId    String
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind         ReviewerKind                      // SEAT | GUEST
  userId       String?                           // SEAT: the client seat's User
  user         User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  email        String
  name         String                            // GUEST: asked once on first visit
  role         String?                           // free label: "Director", "Label"
  token        String?   @unique                 // GUEST only: /r/<token>
  lastOpenedAt DateTime?
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())
  notes        ReviewNote[]
  @@unique([projectId, email])
  @@index([projectId])
}
enum ReviewerKind { SEAT GUEST }
```
- SEAT rows are synced from `ClientMember` (**every** role, not only OWNER) at project create and whenever a seat is added/deactivated on the client. Deactivated seat → `revokedAt`.
- Only reviewers whose `ClientMember.role = OWNER` may approve. GUEST and non-owner seats can only note.
- GUEST token: 32 bytes url-safe. Revoke = `revokedAt`; the route 404s. Guests cannot download anything.

## ReviewNote (new)
```prisma
model ReviewNote {
  id         String       @id @default(cuid())
  reviewId   String
  review     Review       @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  reviewerId String
  reviewer   Reviewer     @relation(fields: [reviewerId], references: [id], onDelete: Cascade)
  timeSec    Float?                               // video.currentTime at composer focus; null = general (migrated) note
  body       String
  sentAt     DateTime?                            // null = draft, visible to its author only
  outcome    NoteOutcome?                         // set by studio when answering
  response   String?                              // studio's one line, shown in the next cut email
  answeredAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
  @@index([reviewId])
  @@index([reviewerId])
}
enum NoteOutcome { CHANGED KEPT }
```
- Drafts are autosaved server-side (survive reloads/devices). A draft can be edited/deleted by its author until sent; sent notes are immutable.
- **Privacy rule:** no staff/admin query returns a note with `sentAt = null`. Admin surfaces may count drafts per reviewer ("Watched · drafting"), never read them.

## Emails
- **Replace** `reviewRequest.tsx` → `cutReady.tsx`; `feedbackReceived.tsx` → `notesIn.tsx` (also used for approvals). Specs in `SCREENS-FILM-REVIEW.md`.
- `reviewMail.ts`: recipients come from `Reviewer` (non-revoked), not `ownerSeats()`. `notifyReviewRequest` no longer fires from `openReview`; it fires from the studio's send action.
