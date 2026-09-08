# Caption drafts — admin UI

For design. The data model, API and worker are built and deployed; this is the
presentation layer, same arrangement as the client-uploads toggle.

## What the feature does

When a new **reel** is delivered for a client who has this switched on, the worker
strips the audio, transcribes it (Deepgram), and drafts the Instagram caption, YouTube
title and YouTube description (Claude). The copy lands in the fields that already exist
on the asset, marked as a draft until a person edits it.

Nothing is backfilled and nothing publishes unreviewed — the existing approval loop
still applies.

## Where it lives

`AdminClientDetailClient.tsx` — the client detail page, in a section headed
**Caption drafts**, currently sitting between *Client accounts* and *Publishing
approval*.

Placement is worth a look: it is a per-client policy like Publishing approval, so those
two probably belong adjacent or merged under one heading.

## Current markup (restyle freely)

Two controls, both plain:

1. **Checkbox** — `autoCaption`, off by default.
   Label: "Draft captions from the audio on new reels"
   Helper: "Transcribes each new reel and writes a first pass at the Instagram and
   YouTube copy, marked as a draft until you edit it. Off by default: this sends this
   client's audio to a transcription service, which is worth deciding per client rather
   than by default."

2. **Textarea** — `captionStyle`, shown only when the checkbox is on. Saves on blur,
   with a small "Saved" confirmation. 8000 character limit, enforced server-side.
   Kicker: "House style"
   Helper below: "Drafts also follow the last five captions someone wrote by hand for
   this client, so the voice keeps tracking yours without editing this box."

## What matters in the design

**The privacy sentence has to stay legible.** The reason this is off by default is that
it sends the client's audio to a third party. That belongs on screen, not in a tooltip
— it is the whole basis of the per-client decision.

**The toggle card pattern from Edit project would suit this.** It is the same kind of
decision (a capability that changes what leaves the building), and consistency between
the two would help. `EditProjectDialog.tsx` has the click-anywhere card.

**The textarea wants to feel like a place for examples, not a one-liner.** Ten rows
minimum, monospaced. The placeholder says examples matter more than description, and
that is true: pasting three real posts beats any adjective.

**Nothing needs a disabled state.** When the toggle is off the textarea is absent
rather than greyed.

## The other surface: draft state on the media row

`AdminMediaClient.tsx` renders three badges beside a file's name, already built:

- `DRAFT CAPTION` — accent border. Copy the model wrote, not yet reviewed. Comes off
  the moment anyone edits the caption, title or YT copy.
- `NO SPEECH` — muted. Audio had no usable dialogue: a music bed, room tone. Nothing
  was drafted, deliberately.
- `TRANSCRIBE FAILED` — accent. See `transcriptError` on the asset.

**The DRAFT CAPTION badge is the important one.** A draft that reads as finished gets
skimmed and shipped. It should be hard to miss without being alarming — this is the
normal state of a new post, not an error. `NO SPEECH` is information, not a problem,
and should read quieter than the other two.

There is currently no way to see the transcript itself in the UI. Worth a thought:
the asset row's Details disclosure, or the calendar drawer beside the caption fields,
would both work. A transcript is useful for pulling a quote even when the draft is
discarded.

## States to design for

| State | What is true |
|---|---|
| Toggle off | No transcription. No style box. Existing behaviour. |
| Toggle on, no style set | Drafts still happen, in a generic voice. Worth nudging toward filling the box. |
| Toggle on, style set | The intended state. |
| Asset drafted | `DRAFT CAPTION` badge; caption fields populated. |
| Asset edited by a person | Badge gone. That asset's caption now feeds future drafts as an example. |
| No speech | `NO SPEECH` badge; caption fields untouched. |
| Failure | `TRANSCRIBE FAILED` badge; `transcriptError` holds the reason. |

## Not in scope for design

Model choice, prompt, provider keys, the queue, and the rule that a post a person has
already written on is left entirely alone.
