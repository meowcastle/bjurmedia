# Handoff: first-login credentials + review guide emails

**For:** Claude Code, working in the `bjur-portal` repo
**From:** design pass, Nov 3 2026
**Status:** ready to build. The templates in `src/emails/` here are written and render. The wiring, the migration and the fixes below are not built yet.

---

## Why

Danny Garibay (client "Momentos - irl") is about to get his first cuts through the portal. Three problems came up:

1. **A reviewer who has never signed in gets stuck.** A cut-ready email sends a seat to `/p/<id>/review`. That page needs a session, and they have no password: the welcome email went out once, maybe long ago, and the password in it was temporary anyway. The link lands on a login form they can't get past.
2. **First-time reviewers don't know how the review screen works.** It pins notes to a timestamp, keeps them as drafts, sends them as a batch, and lets an owner approve. None of that is explained anywhere.
3. **Drafts can reach a client before the studio releases them** (see Fix 3).

## What's in this folder

| Path | What |
|---|---|
| `src/emails/cutReady.tsx` | The existing template plus an optional `login` prop. A drop-in replacement for `src/emails/cutReady.tsx`. |
| `src/emails/reviewGuide.tsx` | New template. Goes to `src/emails/reviewGuide.tsx`. |
| `previews/*.html`, `previews/*.png` | Rendered with sample data: Danny, cut 1, the Momentos logo. |
| `EMAILS-DISTILL.md` | Copy distill applied to both templates: what was cut and why, plus the scorecard. `previews/distill-current-vs-suggested.html` shows them side by side. |

Both templates only call `renderShell`. They add no markup of their own, per the rule in `shell.tsx`.

---

## Feature 1: login details inside the cut-ready email

**Rule:** when a cut is released, every **SEAT** reviewer whose user has `lastLoginAt == null` gets their login details in the cut-ready email itself.

- **Guests:** never. Their `/r/<token>` link is their whole access.
- **Staff:** never.
- **Deactivated users:** never.

**Why a new password, not "their password":** passwords are stored as argon2 hashes, so the original can't be re-sent. Issue a new temporary one with the existing `resetSeatPassword(userId)` in `src/lib/clients.ts`. It already sets `mustChangePassword: true`, so the person picks their own password when they first sign in. This is the same thing the admin "reset password" route does today.

### Wiring, in `src/lib/reviewMail.ts` → `notifyCutReady`

For each reviewer in the loop:

```ts
let login: CutReadyEmailProps["login"];
if (reviewer.kind === "SEAT" && reviewer.userId) {
  const user = await db.user.findUnique({ where: { id: reviewer.userId } });
  if (user && !user.deactivatedAt && !user.isAdmin && user.lastLoginAt == null) {
    const { tempPassword } = await resetSeatPassword(user.id);
    login = {
      signInEmail: user.email,
      tempPassword,
      signInUrl: `${portalUrl()}/login?next=${encodeURIComponent(`/p/${projectId}/review`)}`,
    };
    await db.activity.create({ data: { actor: "Mailer", action: `issued first-login password to ${user.email} with cut ${cut.version}` } });
  }
}
await send(reviewer.email, { ...existingProps, login, canApprove: await canApprove(reviewer) });
```

Points to watch:

- **Dry runs.** Only issue a password when the mail will actually go out. If `DELIVERY_EMAILS !== "live"` (mailer dry run), don't call `resetSeatPassword`. Log `(dry run) would include first-login details for <email>` instead, otherwise you overwrite a password nobody will ever see.
- **Every cut, not just the first.** Each cut sent to a never-signed-in seat issues a fresh password, so each email works on its own. That's fine: the last email they received is always the one that works.
- **Login redirect.** `src/app/(client)/login/page.tsx` currently always redirects to `/`. Add a `next` search param:
  - Only accept same-origin paths that start with `/` and not `//`.
  - Pass it through `LoginForm` as `redirectTo`.
  - Keep the must-change-password step in between: after the password change, continue to `next`.

### Same rule for plain deliveries

In `src/lib/deliveryNotify.ts` → `sendForProject`, for any recipient with `lastLoginAt == null`:

- Send `sendOnboardingEmail` with the `delivery` block instead of `sendDeliveryEmail`. The onboarding template already supports this, with the subject "Your {project} files are ready".
- Use a fresh temporary password from `resetSeatPassword`.
- Apply the same dry-run guard.

---

## Feature 2: the review guide, sent once to each reviewer

**Schema** (new migration `add_reviewer_guide_sent`):

```prisma
model Reviewer {
  // …
  guideSentAt DateTime? // the one-time "how reviews work" email; null = not sent yet
}
```

**Mailer** (`src/lib/mailer.ts`):

```ts
export async function sendReviewGuideEmail(to: string, props: ReviewGuideEmailProps) {
  return sendMail({ to, subject: "How to leave notes on your cut", html: renderReviewGuideEmailHtml(props) });
}
```

**Trigger** (`notifyCutReady`): straight after a reviewer's cut-ready email sends successfully, if `reviewer.guideSentAt == null`:

1. Send the guide with these props:
   - `isGuest: reviewer.kind === "GUEST"`
   - `canApprove: await canApprove(reviewer)`, from `src/lib/reviewAccess.ts` (the same rule the review screen uses)
   - `reviewUrl: watchUrl(projectId, reviewer)`
   - `version: cut.version`
2. Set `guideSentAt = now()`.

Other rules:

- **When it goes out:** on the first cut a reviewer actually receives. A reviewer added at cut 3 gets it with cut 3 (the `only` path for late guests counts too).
- **Order:** cut-ready email first, guide second, so the cut itself is the newest thing in their inbox.
- **Dry run:** only log; don't stamp `guideSentAt`.
- **Never throws.** Keep the existing `try/catch` behaviour: a guide failure is logged to Activity and must not stop the loop.
- **Optional:** a "Resend review guide" item on the reviewer row in the admin review screen, which clears `guideSentAt` and sends again.

**Copy accuracy.** The guide quotes on-screen labels:

- "Add a note at this moment"
- "Only you see these"
- "Send notes to Bjur" (the button actually reads "Send N notes to Bjur")
- "Approve cut N"
- "General"
- The shortcuts: Space play, N note, arrow keys one second, M next note

All of these come from `src/components/ReviewScreen.tsx`. If any of those labels change, update `reviewGuide.tsx` in the same commit.

---

## Fix 3: delivery emails must not announce Film review cuts

`ingest.ts` calls `markDeliveryPending` for every file. `flushPendingDeliveries` then emails every recipient "new files" 15 minutes later, whatever the project type.

On a **FILM** project, that means a cut dropped in the inbox gets announced before the studio presses send. That skips the whole "cuts wait until released" design in `reviews.ts`.

The change:

- In `ingest.ts`, skip `markDeliveryPending` when `project.type === "FILM"`. The cut-ready email, sent on release, is the announcement for Film projects.
- Add a test that a FILM ingest leaves `deliveryPendingAt` null.

Related things to check while you're in there:

- `Project.type` defaults to `DELIVERY`. A project created without picking Film never gets review cuts at all: `openReview` returns early.
- Check the "Sizzle reel — Oct 1st performance" project for Momentos - irl. If it's DELIVERY, it needs to switch to FILM in admin for the feedback round to exist.
- After switching, the drafts already ingested have no `Review` rows, because `openReview` runs at proxy-ready. Either re-drop the newest draft or add a one-off script that calls `openReview(assetId)` for it.

---

## Previews and tests

- Add both new renders to `scripts/email-preview.ts`:
  - `cut-ready-first-login` (cut-ready with `login` set)
  - `review-guide` (seat version and guest version)
- Unit tests, following the `deps` injection pattern already in `reviewMail.ts`:
  - A never-signed-in seat gets `login` and a guide.
  - A seat that has signed in gets neither the login nor a second guide.
  - A guest gets the guide but never `login`.
  - A dry run issues no password and stamps nothing.
  - A FILM ingest doesn't mark a delivery pending.

## Done when

- [ ] Releasing a cut to a never-signed-in seat sends one email with the login and a "Sign in and review cut N" button. Signing in, changing the password, and then landing on the review screen works end to end.
- [ ] Each reviewer gets "How to leave notes on your cut" exactly once, right after their first cut-ready email.
- [ ] Dropping a cut into a FILM project's inbox sends nothing until the studio presses send.
- [ ] `scripts/email-preview.ts` renders the new emails; `pnpm test:e2e` and the unit tests pass.
