# Portal v13: the bjur.nyc look, and the move to portal.bjur.nyc

Approved by Justin on the canvas, 2026-10-25. The boards in this folder are the spec:

- `PortalLogin13`: sign in, with the stamp
- `PortalProjects13`: client home
- `PortalProject13`: a project's files
- `PortalReview13`: reviewing a cut
- `PortalAdmin13`: the studio's Today screen
- `PortalClients13`: the clients list
- `PortalEmails13`: the email template (welcome, delivery, cut ready)

This is a re-skin. Routes, data, the review interaction, and the viewer/carousel/DownloadSheet logic that PORTAL-POLISH §0 marks off-limits all stay as they are. Copy follows PORTAL-DISTILL's vocabulary: "project", "file", "login".

## 1. Tokens: the same system as bjur.nyc

- **Fonts:** replace Fragment Mono and Source Serif with **Archivo** (variable, width 62–125, weight 400–800) and **IBM Plex Mono** (400, 500), through `next/font/google`.
  - Mono labels: 11px, uppercase, letter-spacing .06em, colour ash.
  - Headlines: Archivo 700, letter-spacing -.04em to -.045em, `text-wrap:balance`.
- **Colour:** map the existing token names to bjur.nyc values. Components keep using `--bg`, `--text` and so on.

  | Token | Dark | Light |
  |---|---|---|
  | `--bg` | #141412 | #F4F1E8 |
  | `--s1` | #1A1A17 | #FBF9F3 |
  | `--s2`, `--s3` | #211F1B / #2A2823 | #E9E4D8 / #DED8CA |
  | `--text` (ink) | #F2EEE4 | #1A1A1A |
  | `--body` (sumi) | #D3CEC1 | #3A3934 |
  | `--muted`, `--dim` (ash) | #8C887C | #7A776E |
  | `--line` (rule) | #2F2E29 | #D9D3C4 |
  | `--accent` (shu) | #E04A2E | #C8371F |
  | `--success` | #7FB08A | #2F6B45 |

- **Theme:** dark is now the default for clients too, as on bjur.nyc. Keep the light/dark toggle.
- **Radius:** 3px on buttons and outlined panels, 2px on small chips; pills are fully round. The rest stays square.
- **Grain:** add the 5% noise overlay from bjur.nyc.

## 2. Shared parts

- **Header:** a 3-column grid.
  - Left: the BJUR seal (the same SVG and hover press as bjur.nyc), with two mono lines beside it: "Client portal" in ink, then the client's name. On staff screens the lines read "Studio" and "Client portal admin".
  - Centre: lowercase links at 14px; the current page gets a 2px ink underline.
  - Right: the theme toggle and an initials circle. Staff screens also get the search (⌘K).
  - Under 900px the centre links go into the existing menu.
- **Label grid:** every section is `160px | 1fr` with a 1px ink rule on top and a mono label on the left, the same as /studio v13. On a project page, the folder count sits under its label in Archivo 22px.
- **Buttons:**
  - Primary: shu red fill, white 14px Archivo 600, with a → that nudges on hover.
  - Secondary: a 1px rule outline that turns ink on hover.
  - Text links: a 1px underline that turns shu on hover.
- **Status pills:**
  - "Needs your review": shu outline.
  - "New": green outline.
  - Delivered: plain mono, no pill.
- **Tables:** mono header row, 1px rule rows, 64×40 thumbnail plus title and a mono sub-line. Under 900px, hide the secondary columns.
- **Footer:** "Bjur · Brooklyn, NY", hi@bjur.nyc, portal.bjur.nyc.

## 3. Screens

1. **Sign in: one centered column, with no photo.**
   - The header has only "← bjur.nyc" and the theme toggle.
   - **The seal stamps in** (the press animation from the Home11 stamp intro, 1.25s): it drops from above at 1.55× scale, tilted -11°, lands at -3°, squashes slightly, and settles. A blurred shadow fades as it lands, a shu ring pulses once, and the page gives a 3px thud.
   - The stamp sits at 112px above the copy, and it is the page's only seal.
   - At about 0.9s the rest fades and rises in, staggered: the "Client portal" mono label, the headline "Your work, ready when you are.", the line "Review cuts, leave notes on the frame, and download your masters.", then the form and the note.
   - The form is centred, max 400px: underlined fields, a full-width "Sign in →", and a "Forgot password" link.
   - Under it: "Your login is just for you. Need one for someone else on your team? Ask us." The "Ask us" link opens a mailto to hi@bjur.nyc.
   - The animation plays once per page load, not on the error re-render. With reduced motion, the stamp is static and everything shows immediately.
   - Leave out the board's "Replay stamp" button.
   - The staff sign-in is the same, with the label "Studio".
2. **Client home.**
   - A mono date line and project count, then "Your projects, {first name}." On the right, a secondary "↑ Send us footage" button.
   - When a cut is waiting: a shu-outlined bar with the count, "A cut is waiting for your notes.", the project and cut, and "Review →". Hidden when nothing is waiting.
   - **Latest:** the most recent project, with its still, pill, title, one line, and three numbers (files, size, format). Then "Open project →".
   - **All projects:** the table, with project, delivered, status and size.
3. **Project.**
   - "← All projects", the title, and a mono meta line (delivered date, file count and size, times viewed).
   - Secondary "↑ Send footage" and primary "↓ Download all {size}".
   - Each folder is its own label-grid section.
   - Tiles: 9:16 for vertical media, 16:9 for wide. A round check sits top left and appears on hover. A duration pill sits bottom right. Under each tile: file name, then a Video or Still label.
   - **Selection:** selecting a tile outlines it in shu and slides up a sticky ink bar ("2 selected · 96 MB", Clear, "↓ Download"). Use DownloadSheet's curve.
4. **Review.**
   - Back link ("← Hurt · Color"), the title "{Client} · {Project}, cut N", and cut tabs on the right.
   - The player has a mono timecode chip.
   - The transport has round play, the timeline, and note markers: shu for unsent, ash for sent.
   - The composer: "@ 1:12", "Add a note at this moment", "Add ↵". Under it, the shortcuts line.
   - **Notes column (380px):** "Your notes · N not sent" and "Only you see these", the unsent notes, then "From cut N-1" with Bjur's replies (a Changed or Kept as is pill plus the reply).
   - Pinned at the bottom: "Send N notes to Bjur →", then "No changes needed?" with "Approve cut N".
5. **Studio, Today** (the current dashboard).
   - The title "Today." with "+ Client" and "+ New project".
   - **Four numbers:** active clients, needs you (in shu), in the queue, and worker status.
   - **Needs you:** each item gets a red dot, a title, a mono sub-line and "Open project →".
   - **Activity:** the feed on the left. On the right, System: worker, Slack, social insights, storage.
   - **Recent projects:** the table.
   - Feed copy uses the distill vocabulary: "added" (not "auto-ingested"), "preview" (not "proxy"), "while payment is pending".
6. **Studio, Clients.**
   - The title "Clients." with a count line and "+ New client".
   - All / Active / Off filters.
   - Rows: a round coloured avatar, the name, the mono handle, project and login counts, and status. Disabled rows drop to 45% opacity.
   - The same treatment carries over to pipeline, inbox, reports and integrations: label-grid sections, tables and pills. No new layouts.

## 4. Client logos and colours (automatic)

The boards show the real logos, found the same way the portal should find them. Look at the "Logo + colour" column on `PortalClients13`, the client header (seal × client logo) and the Today screen.

**On client create, on edit, and monthly after that**, a background job (on the existing worker) tries these sources in order and stops at the first good image, at least 128px:

1. **Email domain:** the first client login whose domain isn't a webmail domain (gmail, icloud, outlook, yahoo, proton and the like). Fetch the homepage and take, in order:
   - an `<svg>` or `<img>` in the header whose src or alt contains "logo"
   - `apple-touch-icon`
   - the largest manifest icon
   - `og:image`, only if it's roughly square
   - otherwise the favicon, only if it's 128px or larger
   Example: hitmeupnyc.com and spaceinvadersocial.com.
2. **Instagram handle** (a new optional field on the client): fetch it with the Instagram Graph API Business Discovery call (`profile_picture_url`) through the account connected in Integrations. This only works for business and creator accounts. Do **not** scrape instagram.com.
3. **YouTube handle** (a new optional field): the channel thumbnail from the YouTube Data API.
4. **Brandfetch:** only if `BRANDFETCH_KEY` is set in the NAS `.env`.
5. **Nothing found:** initials on the client's colour. The client sees a one-time "Add your logo" card in Settings.

**Other rules:**

- Save the image to the media volume, square-cropped to 256px. Never hotlink.
- Record the source and when it was fetched.
- A logo Justin uploads by hand ("Replace logo" in the client's row menu) is **locked**: the job never overwrites it.
- **Colour:** take the most saturated mid-tone colour from the logo. If there isn't one (all white or black), use ash.
  - It's used for the 3px accent on the client's admin rows and as the colour behind the initials.
  - It is **not** used on buttons. Shu stays the only action colour.
- **Where the logo shows:**
  - Clients list (40px)
  - Today's "Needs you" and recent-projects rows (20–22px)
  - The client's own header, as "seal × logo" with "Client portal" and their name (34px)

The current clients, as found on the boards:

| Client | Logo source |
|---|---|
| 57 | @57.nyc |
| Adam Knight | @adamknightmusic |
| HMU | hitmeupnyc.com |
| Momentos - irl | @momentosirl |
| SUYINSAMA | @suyinsama |
| Snatam | snatam.com (her @snatamkaur has no profile picture) |
| Space Invader | spaceinvadersocial.com |
| THE SSH | @thesshnyc |

Fill in the handles on these clients. The eight logos as captured are in `logos/` here (160px, as seen on the boards); seed them into the clients so the list looks right on day one, then let the job refresh them. The board blob ids map: suyinsama c979ddda…, 57 5364e103…, adamknight 05b9ba26…, thessh e6ca05db…, momentos bce7fbf2…, snatam bf9bf1ef…, hmu eadf1ce6…, sis e144b6fe….

## 5. Phone, and what must not change

- **Phone:** every screen on the boards was checked at 360–390px with no sideways scroll.
  - Header: the seal, × the client logo, and the name. The links go into the menu.
  - Sections stack with the label above.
  - Tables drop their secondary columns.
  - The review notes move under the player.
  - Primary buttons stay full-width where the board shows them.
- **The photo and video viewer is out of scope.** Do not edit these files:
  - `useMediaCarousel.ts`, `ImageViewer`, `VideoViewer`, `ImageSlide`, `VideoSlide`, `PhotoChrome`, `VideoChrome`, `DownloadSheet`
  - No changes to swipe, commit, spring, drag or chrome-fade logic, or their timings.
  - They pick up only the new token values: the font and colours.
  - Before deploying, run the existing viewer e2e specs and swipe through a photo set and a video set on a real phone. If anything looks or feels different, revert the token change for the viewer, not the viewer code.

## 6. Move to portal.bjur.nyc: mostly done

As of 2026-10-25: the tunnel route for `portal.bjur.nyc` exists, the NAS `.env` has `PORTAL_URL=https://portal.bjur.nyc`, the sender is on bjur.nyc (verified in Resend), and bjur.nyc's site env points at the new host. Left:

1. **The redirect** from portal.justinbjur.com is written in Cloudflare (Rules → Redirect Rules on justinbjur.com) but switched off. Justin turns it on, or OKs Claude doing it. Don't touch it from the NAS.
2. **Moved notice:** support `?from=jb` on the sign-in page (below). Do this before the redirect goes on, and set the rule's target to add it.
3. **Google Cloud:** nothing yet. There is no YouTube OAuth client on any project. When YouTube publishing is set up, create it against `https://portal.bjur.nyc/api/admin/youtube/callback` from the start.
4. **Sender:** the `.env` currently says `MAIL_FROM="Bjur Media <hello@bjur.nyc>"` and `REPLY_TO=newbusiness@bjur.nyc`. Change to `MAIL_FROM="Bjur <hi@bjur.nyc>"` and `REPLY_TO=hi@bjur.nyc` when the new templates ship, and make sure both addresses exist in Google Workspace.
5. Every visible "Bjur Media" or justinbjur.com in the app, the watermark and the emails becomes the seal / "Bjur" / portal.bjur.nyc. Search for "justinbjur" and "BJUR MEDIA".

### What returning clients see after the move

- **Every old link redirects** with a 301 that keeps the path and query, so emailed project links, guest review links (`/r/…`) and send-footage links (`/send/…`) all land on the same page on portal.bjur.nyc. Keep the redirect rule permanently.
- **They sign in once more.** Login cookies belong to the old domain. The email and password don't change.
- **Moved notice:** for 60 days, when a visit arrives through the redirect (add `?from=jb` to the redirect target), the sign-in page shows one mono line under the stamp: "We've moved from portal.justinbjur.com. Same login." Password managers that don't autofill on the new domain are covered by this line.
- **Do the switch when no upload is running** (check the worker queue and active chunked uploads). An upload in progress would have to restart on the new domain.
- After the switch, every new email (deliveries, review requests, password resets) uses portal.bjur.nyc.

## 7. Emails: bring every automation into the bjur.nyc look

`PortalEmails13` is the spec: three examples (welcome, delivery, cut ready) on one shell. Today's emails (`src/emails/*`, `v2paper.ts`, `shell.tsx`, and the plain outreach mail in `mailer.ts`) still use the old identity. Rework them all on that shell:

- **One template** (`shell.tsx`) that every email uses: onboarding, delivery, cut ready, notes in, released, expiry, staff alerts, the review request, password reset, and CRM outreach. Retire `v2paper.ts` and the hand-built layout in `delivery.tsx`.
- **Header:** a 3px shu rule across the top of the card, then the BJUR seal as a PNG at 40px (host it at `https://portal.bjur.nyc/email/seal.png`; no SVG, since Gmail strips it), beside it "Client portal" over "portal.bjur.nyc" in mono, then a 1px divider and the client's logo at 32px, round, when the client has one.
- **Type:** email clients can't load Archivo, so use the stack `Archivo, 'Helvetica Neue', Arial, sans-serif` for everything and `'IBM Plex Mono', Menlo, Consolas, monospace` for labels. No serif anywhere.
- **Colours:** paper #F4F1E8 background, card #FBF9F3 with a 1px #D9D3C4 border, ink #1A1A1A, sumi #3A3934, ash #7A776E, shu #C8371F for the one button and the thin top rule. Light only; email clients don't do our dark theme reliably.
- **Kicker:** a mono line in shu above the headline: "Welcome · {client}", "New files · {client}", "For your review · {client}".
- **Headline:** Archivo 700, 30px, letter-spacing -0.03em, the same sentence case as the site. One short line of body text under it, then one shu button ("Open project", "Review cut 5", "Sign in"). Mono label rows for the facts, in a two-column table under a 1px ink rule: for the welcome email, "Sign in with", "Temporary password" (in mono) and "Portal"; for a delivery, project, files, delivered and available until, with the project still above the table; for a cut, project, cut, length and what happened to the last notes.
- **After the button:** one grey line (14px) with the practical note: how to set a password, when links expire, who can see notes.
- **Footer:** "Bjur · Brooklyn, NY · hi@bjur.nyc" in mono, and the one-line unsubscribe note where it applies.
- **Copy:** take it from the board. The welcome subject becomes "Your portal login is ready" (was "Your Bjur Media portal access is ready"). No "Bjur Media" in any subject or body; "Bjur" or "the portal". Company voice, no em-dashes.
- **Sender:** `MAIL_FROM="Bjur <hi@bjur.nyc>"`, reply-to `hi@bjur.nyc`, once bjur.nyc is verified in Resend. Until then keep the current sender. The default in `mailer.ts` still says `hello@bjur.media`; change it to the new sender.
- Send yourself every template in Gmail, Apple Mail and Outlook before deploying.

## Rules

- No em-dashes in new copy. Company voice. Graded images only.
- Phone and desktop, both themes, reduced motion. Run the existing e2e suites before deploying.
