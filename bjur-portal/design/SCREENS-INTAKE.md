# Intake (v5) — client-scoped submissions

Prototype: `Bjur Intake v2.dc.html` (supersedes v1; v1 is not to be built).
Follows v4 Film, which is unchanged by this work.

## Model

Submissions are working files sent to Bjur to edit or color: video, audio, XML, project files.
They belong to the **client**, never to a project. Projects are created and shared by the studio
and are unrelated to intake. No filing, no project picker, no project name anywhere in intake.

## Schema

```
SubmissionRequest.clientId → Client   required, onDelete: Cascade   (replaces projectId)
UploadBatch.clientId       → Client   required, onDelete: Cascade   (replaces projectId)
UploadBatch.name           String     required on new batches, sender-entered
Submission.clientId        → Client   required                      (replaces projectId)
```

Migration: backfill `clientId` from each row's current `project.clientId`, backfill
`UploadBatch.name` from the request name (or `"Untitled"`), then drop `projectId` on all three.
Deleting a project no longer touches footage.

## Upload path

Unchanged: chunked resumable uploads, 16 MB chunks, truncate-to-committed-offset on resume.
The only change is that the send token resolves to a client instead of a project.
On disk: keep the existing folder naming in code. Paths in the prototype are illustrative.

## Screens

### 1. Admin · client page · Sent to Bjur (admin only)
- Replaces the "Sent to Bjur" block on the admin project page (remove it there).
- One list per client, newest first. Row:
  - Title: batch name as the sender typed it.
  - Meta: sender · `send link` | `portal` · files (`18 of 40` while receiving) · size · file types · date.
  - Status: `RECEIVING` (accent, progress bar) · `ON SERVER` (ok) · `FILES DELETED` (dim).
  - Path line: `smb://mainsqueeze/_submissions/<client>/<folder>/`
  - Actions: `COPY PATH` (copies the SMB path, toast confirms) · `DELETE FILES` (ON SERVER only; toast with undo, then deletes from disk; row stays as a record).
- Summary line under the header: `N receiving · N on server · N open links`.
- Right column: **Send links** — name (who it's for, admin-only label), URL, OPEN/CLOSED, VIEW, CLOSE/REOPEN. `+ NEW LINK` opens a sheet with one field (who it's for) and the URL preview. Link lives 14 days, closes itself, can be reopened.

### 2. Public send page `/send/[clientSlug]/[token]`
- No session. Branded BJUR / client name.
- New field above the drop zone: **What are you sending?** (placeholder `e.g. Xavier, Hurt footage and project files`). Becomes the batch name and folder slug. Blank → `Untitled`.
- Old `/send/[projectSlug]/[token]` URLs keep working: resolve by token, ignore the slug.
- Closed link: "This link is closed. Ask for a new one at hello@bjurmedia.nyc".

### 3. Client portal · Send to Bjur tab (client seats)
- New nav item beside Projects. Same name field + drop zone as the send page; no link needed.
- Below: **Sent** — the seat's own client's portal uploads: name, files, size, types, date, `UPLOADING`/`RECEIVED`.
- Record only. After ingest nothing can be opened, played, previewed or downloaded; rows don't link anywhere; no filenames. **Enforce server-side:** no API route serves submission files or paths to a client session.
- Remove the "Sent to Bjur" block from the client project page.

## Decided

- Name field is optional. Blank → `Untitled`.
- Folder naming and SMB paths follow what the code already does.
