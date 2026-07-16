# Encoding recipe — proxies & thumbnails

The worker turns each registered source file into (a) a **streamable H.264 proxy** the client
plays inline and (b) a **poster thumbnail**. Goal: small, fast-starting, web-safe files that
**preserve the graded Rec.709 look** of the delivered master. BRAW/licensable masters get a
**watermarked** proxy.

Two viable engines — both shown. HandBrakeCLI is easiest to dial in for a consistent look;
ffmpeg gives finer control and does the watermarking. Pick one; the settings below match.

---

## Targets

| Source format | Proxy resolution | Orientation | Notes |
|---|---|---|---|
| Film       | 1080p (1920×1080) | landscape | `ProRes 422 HQ` master |
| Reel       | 1080×1920         | portrait  | vertical, IG-ready |
| Master (BRAW) | 1080p          | landscape | **watermarked** preview; clean master gated behind a license |
| Still (PHOTO) | — (thumbnail only) | either | downscale to a web JPEG/WebP |

Common encode parameters:

- **Codec:** H.264 (x264), High profile, level 4.0.
- **Quality:** constant-quality **RF 20–22** (start at **RF 21**; RF 20 for hero films, 22 for
  long recaps). This is the visually-lossless-ish sweet spot for 1080p delivery previews.
- **Color:** keep **Rec.709** — signal `bt709` primaries/transfer/matrix so the proxy matches
  the graded master and browsers render it correctly. **Do not** let the encoder guess.
- **Faststart:** move the `moov` atom to the front (`-movflags +faststart` / HandBrake "Web
  Optimized") so `<video>` can begin playback before the full file downloads.
- **Audio:** AAC ~160 kbps stereo.
- **Framerate:** "same as source" (peak-limit VFR).

---

## HandBrakeCLI

```bash
# Landscape film / master proxy — 1080p, RF 21, Rec.709, web-optimized
HandBrakeCLI \
  -i "$SRC" -o "$OUT_PROXY" \
  -e x264 --encoder-preset medium --encoder-profile high --encoder-level 4.0 \
  -q 21 \
  --width 1920 --height 1080 --crop 0:0:0:0 \
  --colorspace bt709 \
  -E av_aac -B 160 --mixdown stereo \
  --optimize                                  # <-- Web Optimized / faststart

# Vertical reel proxy — 1080×1920
HandBrakeCLI -i "$SRC" -o "$OUT_PROXY" \
  -e x264 --encoder-preset medium --encoder-profile high -q 21 \
  --width 1080 --height 1920 --colorspace bt709 \
  -E av_aac -B 160 --optimize
```

`--optimize` is HandBrake's faststart. `--colorspace bt709` forces the Rec.709 tags. Raise/
lower `-q` (RF) per the table.

---

## ffmpeg (equivalent + watermarking)

```bash
# Clean 1080p proxy, Rec.709, faststart
ffmpeg -i "$SRC" \
  -vf "scale=1920:1080:flags=lanczos" \
  -c:v libx264 -preset medium -profile:v high -level 4.0 \
  -crf 21 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 160k -ac 2 \
  -movflags +faststart \
  "$OUT_PROXY"
```

### Watermarked preview (BRAW / licensable masters)

Tile the "BJUR MEDIA · PREVIEW" mark diagonally across the frame, matching the prototype's
preview overlay. Use a pre-rendered transparent PNG tile, or `drawtext`:

```bash
ffmpeg -i "$SRC" \
  -vf "scale=1920:1080:flags=lanczos,\
drawtext=fontfile=/fonts/Archivo-Black.ttf:text='BJUR MEDIA · PREVIEW':\
fontcolor=white@0.13:fontsize=42:\
x=mod(t*40\,w)-200:y=h/2:\
box=0" \
  -c:v libx264 -preset medium -profile:v high -crf 22 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 160k -movflags +faststart \
  "$OUT_WATERMARKED_PROXY"
```

For the exact tiled/rotated look from the prototype, render a rotated semi-transparent tile
PNG once and `overlay` it repeatedly (or use the `tile`/`overlay` filter chain) — cheaper and
more controllable than multi-line `drawtext`. The watermark opacity in the design is ~13%
white. The clean master is only ever served after a `License` row exists (see
`ARCHITECTURE.md` §4).

---

## Thumbnails / poster frames

```bash
# Poster frame from ~1s in, downscaled, for video tiles
ffmpeg -ss 00:00:01 -i "$SRC" -frames:v 1 \
  -vf "scale=960:-1:flags=lanczos" -q:v 3 "$OUT_THUMB"

# Still image → web thumbnail
ffmpeg -i "$SRC" -vf "scale=960:-1:flags=lanczos" -q:v 3 "$OUT_THUMB"
```

Write thumbs as JPEG (`-q:v 3`) or WebP. Store under `DERIVED_ROOT`, set `thumbRelPath`.

---

## BRAW note

Blackmagic RAW isn't natively decodable by stock ffmpeg/HandBrake without Blackmagic's SDK.
Two options:
1. Install `libbraw` / the Blackmagic RAW SDK into the worker image and decode directly.
2. **Simpler for a NAS deployment:** export a ProRes 422 HQ master from DaVinci Resolve as the
   delivered master, register *that* as the source for proxy generation, and keep the original
   `.braw` as the licensable master file (served on download, never transcoded). The prototype
   already models masters as `BRAW · <size>` while proxies are `ProRes`/watermarked H.264 —
   this matches option 2.

---

## Validation checklist per proxy

- [ ] Plays inline in Safari + Chrome, scrubbable (faststart working — `ffprobe` shows `moov`
      before `mdat`).
- [ ] Colors match the master (no washed-out / oversaturated shift → Rec.709 tags present:
      `ffprobe -show_streams` reports `color_space=bt709`).
- [ ] File size sane (a 1-min 1080p film proxy ≈ 40–120 MB at RF 21).
- [ ] Watermark visible but non-destructive on licensable masters; absent on normal
      deliverables.
