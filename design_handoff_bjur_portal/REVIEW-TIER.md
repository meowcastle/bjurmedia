# Work order — the review tier

Owner: Claude Code. Written 23 Sep 2026.

Research behind it: **10-bit video for browser review**
(https://claude.ai/code/artifact/b001394b-cfc5-4aa8-aec0-932d499bab1d) — the support matrix,
codec strings, colour-management findings and sources live there. This file is only what to
build in this repo.

---

## The headline: do not change the existing proxy

`src/lib/proxyGen.ts` is correctly tuned for what it was built for. Its own comment says so:
"this is a scrolling mobile proxy, not something anyone licenses." CRF 26 with a 4000k cap at a
1080p bound is a sensible scroll preview and should stay exactly as it is.

**A colour-critical review copy is a new tier, not a louder version of that one.** Raising CRF
and adding 10-bit inside `encodeProxy` would inflate every thumbnail and reel on the NAS and
wreck the mobile experience that pipeline exists to serve. Add a second rendition class beside
it.

## Why the proxy failed on this particular master

Worth writing down, because it looks like a pipeline bug and is not one.

The master is a music video at mean luma ~12, with 97% of pixels below 64/255. CRF rate control
allocates bits by perceptual need, and near-black flat areas read as cheap — so CRF 26 spent
about **1.4 Mb/s** on a 3840x1606 frame. The `-maxrate 4000k` cap never engaged; it constrains
spikes, and there were none. The binding constraint was CRF, on content whose statistics are
nothing like the concert and event reels this setting was measured against.

So: the pipeline behaved as designed, and the design does not suit a dark 2.39:1 grade being
judged for shadow detail. Nothing to fix in the existing path.

## What to build

### 1. A review rendition class in `proxyGen.ts`

New exported function beside `encodeProxy` — do not add a mode flag to it, the branching would
end up everywhere. Three renditions per review asset:

| # | Codec | Depth | Resolution | Rate control | Purpose |
|---|---|---|---|---|---|
| 1 | libx265 Main 10 | 10 | source (bound 3840) | `-crf 18 -maxrate 32M -bufsize 64M` | Apple + Chrome/Edge |
| 2 | libx264 High | 8 | 1920 bound | `-crf 18 -maxrate 14M -bufsize 28M` | guests, unknown devices |
| 3 | libvpx-vp9 Profile 2 | 10 | source (bound 3840) | `-crf 24 -b:v 24M` | Firefox — see open questions |

Rendition 1 **must** carry `-tag:v hvc1`. `libx265` writing to MP4 defaults to `hev1`, and
Apple's AVFoundation — Safari, QuickTime, Finder, QuickLook — accepts only `hvc1`. Without it
Safari shows a black player and reports no error. It is a container tag, so a wrong one is
fixable by remux (`-c copy -tag:v hvc1`) without re-encoding.

Keep `-preset slow` here. These are minutes-long, infrequent, and not in the scroll path.

### 2. Preserve the colour handling exactly

This repo already gets this right and it is the thing most likely to be lost in a rewrite. Carry
over from `encodeProxy` verbatim:

- all four tags: `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv`
- `in_range=auto:out_range=tv` on the scale filter
- `-pix_fmt` pinned (`yuv420p10le` for the 10-bit renditions, `yuv420p` for rendition 2)

The comment block above the scale filter records why: 54 of 391 proxies on the NAS arrived
full-range, and players disagree about the VUI flag, so converting to limited makes every file
"the one combination that is boring everywhere." That reasoning applies to the review tier
identically. The research doc's colour section found browsers that ignore the range flag
outright (Edge) or drop to BT.601 when hardware acceleration is off (Chrome/macOS) — which is
an argument for keeping this discipline, not relaxing it.

### 3. Player: source order and a quality control

`VideoViewer.tsx`, `VideoSlide.tsx` and `AdminProxyViewer.tsx` currently point at a single
proxy. For review assets, emit multiple `<source>` elements, best first — the browser takes the
first type string it believes it can play:

```
hvc1.2.4.L153.B0            video/mp4
vp09.02.51.10.01.01.01.01.00  video/webm
avc1.640033                 video/mp4
```

VP9 goes **below** HEVC deliberately: Safari has reported VP9 support and then failed to play
the file (WebKit 216652), so it must never sit above HEVC for a Safari viewer.

Then add an explicit rendition switch, labelled for the viewer ("Full quality" / "Smooth
playback"), not by codec. Source selection cannot tell that a 2019 Intel MacBook will decode
10-bit HEVC in software at four frames a second — the viewer can. Swap `src`, call `load()`,
restore `currentTime` on `loadedmetadata`.

Do **not** build HLS/DASH for this. Reasoning in the research doc: the NAS uplink is the real
constraint and no protocol creates bandwidth.

### 4. Storage and the worker

- These are 1–2 GB per asset against ~40 MB for a scroll proxy. They need their own retention
  rule and should not land in `DERIVED_ROOT` beside the scroll proxies without a size policy.
- Three renditions at `-preset slow` is a long job. `WORKER_CONCURRENCY` is tuned for scroll
  proxies; a review encode should be a distinct queue or it will starve normal ingest.
- Review renditions should be opt-in per project, not generated for everything.

## Open questions — Justin's, not Code's

1. **Is Firefox in any review group?** VP9 exists in the ladder only for Firefox, which has no
   HEVC at all. If nobody uses it, drop rendition 3 and spend the encode time on a second HEVC
   rendition at 1080p instead. This is the one assumption flagged in the research doc.
2. **Does the review tier get the watermark?** `markFilter` and the `hold`/`preview` styles
   exist for licensing. A review copy for a director is a different thing from a payment-hold
   preview, and `UNMARKABLE` currently throws rather than falling back.
3. **Retention.** How long do 1–2 GB review renditions live after sign-off?

## Verify before anything reaches a client

```
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,pix_fmt,color_space,color_primaries,color_transfer,color_range,codec_tag_string \
  -of default=noprint_wrappers=1 out.mp4
```

Wants `pix_fmt=yuv420p10le`, all four colour fields `bt709`/`tv`, and `codec_tag_string=hvc1`.
If that last reads `hev1`, Safari will fail silently — remux, do not re-encode.
