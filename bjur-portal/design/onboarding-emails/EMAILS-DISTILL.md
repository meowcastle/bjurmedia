# Review emails: distill brief

## Verdict

The two new emails said everything twice. The headline, the facts table and the button all repeated "cut 1 is up". The guide re-explained the login and the shortcuts, and opened with three sentences of preamble.

Distilled, they lose 28–42% of their words and every review-screen function still has a name. One meaning fix ships first: the cut-ready email offered "approve" to people who can't approve.

| Measure | Before | After |
|---|---|---|
| Words: cut-ready email with login | 120 | 86 |
| Words: review guide (owner / guest version) | 279 / 286 | 162 / 168 |
| "Cut 1 is up" stated in the cut-ready email | 5 | 3 (inbox preview line, headline, button) |
| Lines explaining the login | 2 | 1 |
| "Only you see your notes" across the first-time flow | 2 | 1 (guide) |
| Shortcuts said twice in the guide (Space, N) | 2 | 0 (shortcut box only) |
| Intro sentences before the guide's steps | 3 | 1 |
| Count lines ("Four steps") | 1 | 0 |
| "Approve" offered to non-owners | yes | no |
| Review-screen functions with a visible name | 9 | 9 |

The 9 functions:

1. timed note
2. general note
3. private draft
4. send as a batch
5. approve (owners)
6. owner sign-off (non-owners)
7. note outcome: changed / kept as is
8. guest link
9. temporary password with a forced change

## Engine facts the copy is checked against

- `src/components/ReviewScreen.tsx`. On-screen labels:
  - "Add a note at this moment"
  - "General"
  - "Only you see these"
  - "Send N notes to Bjur"
  - "Approve cut N" (only when `viewer.canApprove`)
  - Shortcuts: Space, N, ← →, M
- `src/lib/reviewAccess.ts:56`. `canApprove(reviewer)`: only owners can approve.
- `prisma/schema.prisma`, Reviewer.kind:
  - SEAT signs in.
  - GUEST uses the token link `/r/<token>`.
- `ReviewNote`:
  - `timeSec` null means a general note.
  - `sentAt` null means a private draft.
  - `outcome` is CHANGED or KEPT.
- `src/lib/clients.ts:150`. `resetSeatPassword` sets `mustChangePassword`.

## Meaning map

- **True synonyms, merged.** These all say the same thing as the headline, so they're cut and the headline stays:
  - "The first cut is up"
  - "is waiting for you"
  - "Cut · 1 of 1"
  - "ready to watch" (kept only as the inbox preview line)
- **Kept distinctions:**
  - "Add a note at this moment" vs General note: a pinned note vs one about the whole cut (`timeSec`).
  - Approve vs Sign-off: owner vs everyone else (`canApprove`).
  - Login vs personal link: seat vs guest.
  - "Only you see these" vs "Send notes to Bjur": draft vs sent.
  - Changed vs kept as is: the two outcome values.
  - Login (noun) vs sign in (verb).
- **Overloaded, now split.** "Approve it if it is good to go" was sent to every reviewer, but the screen only offers Approve to owners. It's now conditional on `canApprove`.
- **Unresolved:** none.

## Cut list (files in `src/emails/` beside this brief; re-grep before editing)

| Email | Cut | Keep / change |
|---|---|---|
| cutReady | "The first cut is up." / "Cut N is up." | Cut. The headline says it. |
| cutReady | Facts row "Cut · N of N" | Cut. The headline and button carry the cut number. |
| cutReady (login) | "You have not signed in to the portal yet, so your login is below. You will choose your own password the first time." | Becomes "Your login is below. You choose your own password when you sign in." |
| cutReady (login) | Note "Your login is just for you. Only you see your notes until you press Send." | Cut for the login version: the welcome email covers the first half, and the guide that follows covers drafts. The regular version keeps "Only you see your notes until you press Send." |
| cutReady | "…, or approve it if it is good to go." | Only when `canApprove !== false`. New prop `canApprove`. |
| reviewGuide | "Cut N of {project} is waiting for you. Here is how the review screen works, so your notes land exactly where you mean them." | Becomes "Three things to know before you open cut N." |
| reviewGuide | "Sign in with your portal login and the cut opens in your project." | Cut. The cut-ready email owns the login. |
| reviewGuide | Items title "Four steps" | Cut. The numbering already says it. |
| reviewGuide | Step 01 "Watch it through" | Cut. Watching isn't a screen function, and Space is in the shortcut box. |
| reviewGuide | Steps 02–04 | Become 01 Note the moment / 02 Send together / 03 Approve or Sign-off, one or two lines each. "or press N" and the closing "so we…" reasons are cut. |
| reviewGuide | Note "Every note gets an answer. The next cut's email lists each one…" | Becomes "We answer every note in the next cut's email: changed, or kept as is and why." |

## Constraints

- No visual change: both emails still only call `renderShell`, with the same tokens and layout.
- No capability removed.
- Wiring: `notifyCutReady` passes `canApprove: await canApprove(reviewer)` to the cut-ready email, in addition to everything in HANDOFF.md.

## Verify

1. Run `npx tsx scripts/email-preview.ts` after adding both previews.
2. Each review-screen label quoted in the guide still matches `ReviewScreen.tsx`.
3. Re-count the scorecard above.
4. All 9 functions still have a name in at least one of the two emails.
