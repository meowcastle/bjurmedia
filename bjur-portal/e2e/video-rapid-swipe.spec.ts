import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "e2e/.auth/sasha.json" });

/**
 * Fires `count` consecutive fast-flick swipe gestures back-to-back, all within
 * a single page.evaluate() call (no Node<->browser IPC round-trip between
 * them, for precise timing control), on the video carousel's gesture-capture
 * surface. Uses real PointerEvents (pointerType: "touch") since that's what
 * framer-motion's drag system actually listens for.
 *
 * Deliberately a SHORT, FAST flick (~18% of viewport width in ~30ms) rather
 * than a full drag-to-edge: a full-distance drag leaves x already sitting at
 * (or very near) its target by pointerup, so the "cosmetic" settle animation
 * has almost nothing left to travel and completes near-instantly — no real
 * window for a second touch to interrupt. A velocity-based flick commits from
 * a short drag, so the settle animation still owes most of a full width of
 * travel — that's the long-lived, actually-exploitable interruption window,
 * and matches the plan's own worked example of the worst case.
 */
async function rapidFlickBurst(page: Page, direction: "left" | "right", count: number) {
  await page.evaluate(
    async ({ dir, n }) => {
      const track = document.querySelector(".flex.h-full");
      const overlay = track?.nextElementSibling as HTMLElement | null;
      if (!overlay) throw new Error("video-gesture-surface not found");

      const width = window.innerWidth;
      const startX = width / 2;
      const travel = width * 0.18; // short — must commit via velocity, not distance
      const endX = dir === "left" ? startX - travel : startX + travel;

      function fire(type: string, x: number) {
        overlay!.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: 400,
            bubbles: true,
            cancelable: true,
          })
        );
      }

      for (let g = 0; g < n; g++) {
        fire("pointerdown", startX);
        // 3 fast moves covering the short travel in ~30ms total — well past
        // the 500px/s commit-velocity threshold at any realistic viewport width.
        for (let i = 1; i <= 3; i++) {
          await new Promise((r) => setTimeout(r, 10));
          fire("pointermove", startX + ((endX - startX) * i) / 3);
        }
        fire("pointerup", endX);
        // Gap before the next flick — comfortably inside the ~300-500ms spring
        // settle window this is meant to interrupt, not after it.
        await new Promise((r) => setTimeout(r, 60));
      }
    },
    { dir: direction, n: count }
  );
}

function activeVideoId(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector('video[data-testid="active-video"]') as HTMLVideoElement | null;
    return v ? new URL(v.src).pathname.split("/")[3] : null;
  });
}

function hasNextButton(page: Page) {
  return page.evaluate(() => !!document.querySelector('button[aria-label="Next video"]'));
}

function hasPrevButton(page: Page) {
  return page.evaluate(() => !!document.querySelector('button[aria-label="Previous video"]'));
}

/** The track's actual rendered translateX, read off its computed transform
 * matrix. The fix's real invariant is "this always equals -viewportWidth once
 * settled" — a round-trip on asset ids can coincidentally net out correctly
 * even if a commit was silently dropped along the way (e.g. 2 attempts, 1
 * lost + 1 succeeds, nets to the same single step either direction), so this
 * checks the actual position, not just where we ended up. */
function trackTranslateX(page: Page) {
  return page.evaluate(() => {
    const track = document.querySelector(".flex.h-full") as HTMLElement | null;
    if (!track) return null;
    const m = getComputedStyle(track).transform;
    if (m === "none") return 0;
    const match = m.match(/matrix\(([^)]+)\)/);
    if (!match) return null;
    return parseFloat(match[1].split(",")[4]);
  });
}

/** Walks back to the first item via ordinary, fully-settled single swipes (not
 * the rapid burst under test) so the test starts from a known, deterministic
 * position regardless of where the opened tile happens to fall in nav order. */
async function goToFirstItem(page: Page) {
  for (let i = 0; i < 5; i++) {
    if (!(await hasPrevButton(page))) return;
    await rapidFlickBurst(page, "right", 1);
    await page.waitForTimeout(500);
  }
  throw new Error("could not reach the first item in the nav order");
}

test("rapid consecutive swipes stay in sync — no desync, no crash", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");
  await page.getByText("Spring Campaign 2026").click();
  // p1 seeds exactly 3 reels — only 2 hops of headroom either direction, not
  // enough for a 3-flick burst. Stay on the default "All" view instead (reels
  // + films together, 5 videos) so there's room, then open a reel tile from it.
  await page.getByText("SSH_Reel_Hero.mp4").click();
  await expect(page.getByTestId("active-video")).toBeVisible();

  await goToFirstItem(page);
  const startId = await activeVideoId(page);
  expect(startId).toBeTruthy();
  expect(await hasNextButton(page)).toBe(true);

  const width = await page.evaluate(() => window.innerWidth);

  // Fire flicks back-to-back with only a short gap — comfortably inside the
  // ~350-500ms spring settle window — between each. This is exactly the
  // interruption window the bug lived in: framer interrupts the in-flight
  // animation on x the instant a new touch lands (before any drag-distance
  // threshold is even evaluated), which used to mean the interrupted commit's
  // onComplete — and thus the currentIndex update — never ran, desyncing
  // state from the visual position. 3 flicks (not 2): a dropped commit can
  // coincidentally still net out to the "right" asset id on a short/even
  // burst, so this needs enough attempts for drift to actually show up.
  await rapidFlickBurst(page, "left", 3);
  await page.waitForTimeout(700); // let the final commit's cosmetic animation settle

  const midId = await activeVideoId(page);
  expect(midId).not.toBe(startId);
  // The real invariant: wherever we ended up, the track must actually be
  // resting at -width for that index — not stuck at some arbitrary mid-flight
  // offset left over from an interrupted animation.
  expect(await trackTranslateX(page)).toBeCloseTo(-width, 0);

  // Round trip: swiping back the same number of times should land exactly back
  // on the video we started from. If state had desynced from the visual
  // position during the rapid burst, this would not reliably hold — either
  // landing on the wrong asset or the gesture surface no longer responding.
  await rapidFlickBurst(page, "right", 3);
  await page.waitForTimeout(700);

  const endId = await activeVideoId(page);
  expect(endId).toBe(startId);
  expect(await trackTranslateX(page)).toBeCloseTo(-width, 0);

  // The carousel must still be a live, responsive video — not the "crashes
  // out" / frozen state this test guards against.
  await expect(page.getByTestId("active-video")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
