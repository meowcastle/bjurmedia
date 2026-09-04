import { test, expect, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

/**
 * A standing check that both portals survive a phone.
 *
 * Written after a sweep found the whole client and admin surface holding up at 390px
 * except for its tap targets: back links 16px tall, row checkboxes 14px, an unlink
 * control 8px wide. Nothing was clipped — things were simply too small to hit.
 */
type Audit = { pageOverflow: number; offEdge: string[]; tiny: string[] };

async function audit(page: Page): Promise<Audit> {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const offEdge: string[] = [];
    const tiny: string[] = [];

    const desc = (el: Element) => {
      const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${t ? ` "${t}"` : ""}`;
    };
    const inScroller = (el: Element) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };

    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      if (r.right > vw + 1 && !inScroller(el) && el.children.length === 0) {
        offEdge.push(`${desc(el)} right=${Math.round(r.right)}`);
      }
      if (["BUTTON", "A", "INPUT"].includes(el.tagName)) {
        // A control inside a label is tapped via the label, so that is the real target.
        const label = el.closest("label");
        const hit = label ? label.getBoundingClientRect() : r;
        if (hit.height > 0 && (hit.height < 30 || hit.width < 24)) {
          tiny.push(`${desc(el)} ${Math.round(hit.width)}x${Math.round(hit.height)}`);
        }
      }
    }
    return {
      pageOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
      offEdge: [...new Set(offEdge)],
      tiny: [...new Set(tiny)],
    };
  });
}

async function check(page: Page, url: string) {
  await page.goto(url);
  const r = await audit(page);
  // Sideways scrolling on a phone is always a bug; a scroll container that wants it
  // declares overflow-x itself and is excluded above.
  expect(r.pageOverflow, `${url} scrolls sideways`).toBeLessThanOrEqual(1);
  expect(r.offEdge, `${url} has content past the right edge`).toEqual([]);
  expect(r.tiny, `${url} has tap targets under 30px`).toEqual([]);
}

test.describe("client portal on a phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, storageState: "e2e/.auth/sasha.json" });

  test("projects, project detail and account all fit and are tappable", async ({ page }) => {
    test.slow();
    await check(page, "/");
    await check(page, "/p/p1");
    await check(page, "/account");
  });
});

test.describe("admin portal on a phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true, storageState: "e2e/.auth/admin.json" });

  test("every admin screen fits and is tappable", async ({ page }) => {
    test.slow();
    for (const url of [
      "/admin",
      "/admin/clients",
      "/admin/media?project=p8",
      "/admin/reports",
      "/admin/integrations",
      "/admin/team",
    ]) {
      await check(page, url);
    }
  });

  test("the calendar view fits too", async ({ page }) => {
    // Reached by a toggle rather than a URL, so the sweep above never saw it — and it
    // is a week grid, which is the layout most likely to fight a 390px screen.
    await page.goto("/admin/media?project=p8");
    await page.getByRole("button", { name: /^Calendar$/i }).click();
    await expect(page.getByText(/Week of/i).first()).toBeVisible();

    const r = await audit(page);
    expect(r.pageOverflow, "calendar scrolls sideways").toBeLessThanOrEqual(1);
    expect(r.offEdge, "calendar has content past the right edge").toEqual([]);
    expect(r.tiny, "calendar has tap targets under 30px").toEqual([]);
  });

  test("the row checkbox can be hit without hitting the 14px box", async ({ page }) => {
    await page.goto("/admin/media?project=p8");
    const row = page.locator('[data-testid^="asset-row-"]').first();
    const box = row.locator('input[type="checkbox"]');

    await expect(box).not.toBeChecked();

    // Tap the corner of the label's padding rather than the checkbox itself. Padding has
    // no effect on a checkbox element, so this only works because of the wrapping label.
    const label = row.locator("label").first();
    const r = (await label.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(30);
    await page.mouse.click(r.x + 3, r.y + r.height - 3);

    await expect(box).toBeChecked();
  });
});
