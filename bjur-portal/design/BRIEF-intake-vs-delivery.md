# Brief: separate footage intake from the project a client reviews

Date: 2026-09-24. Follows the v4 Film work, which is built and deployed.

## The problem, as it actually happened

`Adam Knight / MV - Hurt` is one project holding two unrelated jobs:

- **296 submissions, ~302 GB** of rushes sent by Xavier (the shooter) through a send link,
  over about two weeks.
- **One finished export**, the music video, which is what Adam and the label are meant to
  watch and leave notes on.

Those have different lifecycles, different audiences and different lifespans. The rushes
arrive before anyone knows what the cuts are; the review project is one piece going through
numbered cuts. Holding both in one project produced three concrete problems:

1. **You cannot retire one without the other.** Deleting the project is refused (correctly)
   because it holds the only copy of a fortnight's footage. So the review project cannot be
   started fresh without first solving a 302 GB storage question that has nothing to do
   with review.
2. **The project page mixes what came in with what goes out.** "Sent to Bjur" and "Cuts"
   sit on the same screen and answer different questions.
3. **Footage can arrive before a project exists.** Today a send link requires a project, so
   one gets created early and becomes the wrong shape later.

The current workaround is two projects by convention — one for intake, one for the film —
with nothing in the UI saying which is which.

## What we think the answer is

Intake belongs to the **client**, not to a project. A send link is "send footage to Bjur for
Adam Knight", and filing it into a project happens later, if at all.

Schema today (all required, all `onDelete: Cascade`):

```
SubmissionRequest.projectId → Project
UploadBatch.projectId       → Project
Submission.projectId        → Project
```

Proposed: those hang off `Client`, with `projectId` optional — set when a batch is filed
into a project, null while it is just footage that arrived.

## What we need drawn

1. **Where client-level intake lives in the admin.** Today "Sent to Bjur" is a block on the
   project page. If intake is client-scoped, is it a block on the client page, its own nav
   item, or part of Today? It is the screen Justin looks at while a shoot is being sent.

2. **A batch that belongs to no project.** What does a batch look like before it is filed?
   What is the action that files it — a picker on the batch, a drag onto a project, or
   something the ingest watcher infers from the folder the sender used? Can a batch be
   split across projects, or is that not a real case?

3. **The send link itself.** Today: `/send/[projectSlug]/[nameToken]`, branded with the
   client name, no session. If the link is client-scoped, does the URL change, and does the
   sender see anything different? (The sender is often a freelancer who has never seen the
   portal and never will.)

4. **What the client sees.** Client seats can currently reach an upload page for a project.
   If intake is client-level, does a client still see anywhere they have sent footage to,
   or is intake purely an inbound thing they never look at again?

5. **Retention.** Rushes are large and temporary; delivered work is small and permanent.
   Is there a state for "this footage has been used, it can go", and whose job is it to say
   so? This is the question that would have let MV - Hurt be retired cleanly.

6. **The Film project's relationship to intake.** A Film project probably wants to *point
   at* the footage it was cut from without owning it. Is that a link, a copy, or nothing at
   all?

## Constraints worth knowing

- **The upload path is the one place a bug costs a client's only copy.** Resumable chunked
  uploads, 16 MB chunks, truncate-to-committed-offset on resume. Any change here gets
  built slowly and behind tests. Please do not assume it can be reshaped freely.
- Submissions land on disk under `_submissions/<client>/<batch>/…` and are moved into the
  canonical tree by the ingest watcher. The on-disk shape is already client-first, which
  suggests the database is the thing that is out of step, not the storage.
- ~9 files reference the submission→project relation today, plus the send page and the
  watcher.
- Nothing about this blocks the Film review loop, which is finished and working. This is
  about intake only.

## Not asking for

A redesign of the review screen, the cut loop or the emails — those are built and settled.

