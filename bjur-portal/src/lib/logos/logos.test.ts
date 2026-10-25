/**
 * Offline checks for the logo finder: the homepage parser and the website source run
 * against a local HTML fixture, with every image inlined as a data: URL, so nothing here
 * touches the network. Needs ffmpeg on the PATH, like the worker.
 *
 *   npx tsx src/lib/logos/logos.test.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findHomepageCandidates, manifestIcons } from "./html";
import { logoFromHomepageHtml, isBrandDomain, cleanDomain } from "./sources";
import { LOGO_ASH, LOGO_SIZE, measureImage, pickLogoColor, sanitizeSvg, sniffImage } from "./image";
import { safeFetch } from "./fetch";

/** A solid-colour PNG of the given size, as a data: URL. */
function pngDataUrl(color: string, w: number, h: number) {
  const png = execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=${w}x${h}`,
    "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1",
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const fixture = readFileSync(path.join(__dirname, "fixtures/homepage.html"), "utf8");
const PAGE = "https://example-brand.com/";

test("parser: finds header logos only, in page order, and resolves against <base>", () => {
  const html = fixture.replace("{{HEADER_SMALL}}", "/img/logo-small.png").replace("{{APPLE_180}}", "/touch-180.png");
  const c = findHomepageCandidates(html, PAGE);
  assert.equal(c.header.length, 2, "the logo <img> and the logo-linked <svg>; not the hero, not the footer sponsor");
  assert.deepEqual(c.header[0], { kind: "url", url: "https://www.example-brand.com/img/logo-small.png", tier: "header", width: 64, height: 64 });
  assert.equal(c.header[1].kind, "svg");
  assert.deepEqual(c.appleTouch.map((a) => a.kind === "url" && a.url), [
    "https://www.example-brand.com/touch-180.png",
    "https://www.example-brand.com/touch-120.png",
  ]);
  assert.equal(c.manifestUrl, "https://www.example-brand.com/site.webmanifest");
  assert.equal(c.ogImage?.kind === "url" && c.ogImage.width, 1200);
  // Relative to <base href=".../sub/">, largest first, then the conventional /favicon.ico.
  assert.deepEqual(c.favicons.map((f) => f.kind === "url" && f.url), [
    "https://www.example-brand.com/sub/favicon-192.png",
    "https://www.example-brand.com/favicon-32.png",
    "https://www.example-brand.com/favicon.ico",
  ]);
});

test("parser: manifest icons, largest first, maskable-only last", () => {
  const icons = manifestIcons(
    { icons: [
      { src: "/m-512.png", sizes: "512x512", purpose: "maskable" },
      { src: "/a-192.png", sizes: "192x192" },
      { src: "/a-384.png", sizes: "384x384", purpose: "any maskable" },
    ] },
    "https://x.com/site.webmanifest",
  );
  assert.deepEqual(icons.map((i) => i.kind === "url" && i.url), ["https://x.com/a-384.png", "https://x.com/a-192.png", "https://x.com/m-512.png"]);
});

test("website source: skips a header logo under 128px and takes the 180px apple-touch-icon", async () => {
  const html = fixture
    .replace("{{HEADER_SMALL}}", pngDataUrl("0x7A3FB0", 64, 64))
    .replace("{{APPLE_180}}", pngDataUrl("0xFE3734", 180, 180));
  const log: string[] = [];
  const hit = await logoFromHomepageHtml(html, PAGE, (m) => log.push(m), async () => {
    throw new Error("manifest should not be needed");
  });
  assert.ok(hit, log.join("\n"));
  assert.equal(hit.tier, "apple-touch-icon");
  assert.equal(sniffImage(hit.png), "png");
  assert.deepEqual(measureImage(hit.png, "png"), { width: LOGO_SIZE, height: LOGO_SIZE });
  assert.ok(log.some((l) => l.includes("64×64, under 128px")), log.join("\n"));
});

test("website source: a long wordmark is kept only as a last resort, padded to square", async () => {
  const html = `<html><head><meta property="og:image" content="${pngDataUrl("blue", 1200, 630)}"></head>
    <body><header><img alt="Brand logo" src="${pngDataUrl("0xFE3734", 600, 100)}"></header></body></html>`;
  const log: string[] = [];
  const hit = await logoFromHomepageHtml(html, PAGE, (m) => log.push(m));
  assert.ok(hit, log.join("\n"));
  assert.equal(hit.wide, true);
  assert.deepEqual(measureImage(hit.png, "png"), { width: LOGO_SIZE, height: LOGO_SIZE });
  // The 1200×630 og:image was refused for not being square, without being downloaded.
  assert.ok(log.some((l) => l.startsWith("  skip og:image") && l.includes("not square")), log.join("\n"));
});

test("website source: nothing usable → null", async () => {
  const hit = await logoFromHomepageHtml("<html><body><p>hi</p></body></html>", "data:,", () => {});
  assert.equal(hit, null);
});

test("colour: the saturated mid-tone wins; black, white and grey give ash", () => {
  const px = (rgb: [number, number, number], n: number) => Array.from({ length: n }, () => [...rgb, 255]).flat();
  const redOnWhite = new Uint8Array([...px([255, 255, 255], 800), ...px([0, 0, 0], 100), ...px([254, 55, 52], 100)]);
  assert.equal(pickLogoColor(redOnWhite), "#FE3734");
  assert.equal(pickLogoColor(new Uint8Array([...px([255, 255, 255], 500), ...px([20, 20, 20], 500)])), LOGO_ASH);
  assert.equal(pickLogoColor(new Uint8Array([...px([128, 128, 128], 1000)])), LOGO_ASH);
  // A few stray vivid pixels (anti-aliasing) are not the brand colour.
  assert.equal(pickLogoColor(new Uint8Array([...px([255, 255, 255], 995), ...px([0, 255, 0], 5)])), LOGO_ASH);
});

test("domains: webmail is not a brand; input is cleaned", () => {
  for (const d of ["gmail.com", "icloud.com", "outlook.com", "yahoo.fr", "proton.me", "pm.me", "hey.com"]) {
    assert.equal(isBrandDomain(d), false, d);
  }
  assert.equal(isBrandDomain("hitmeupnyc.com"), true);
  assert.equal(cleanDomain("https://www.SpaceInvaderSocial.com/about"), "spaceinvadersocial.com");
});

test("svg: scripts, handlers and external refs are stripped; DOCTYPEs refused", () => {
  const out = sanitizeSvg(`<svg onload="x()"><script>alert(1)</script><image href="https://evil/x.png"/><use href="#a"/></svg>`)!;
  assert.ok(!/script|onload|evil/.test(out), out);
  assert.ok(out.includes('href="#a"'));
  assert.ok(out.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.equal(sanitizeSvg(`<!DOCTYPE svg [<!ENTITY a "a">]><svg/>`), null);
});

test("fetch: refuses private addresses before sending anything", async () => {
  await assert.rejects(safeFetch("http://127.0.0.1:1/", { maxBytes: 10 }), /private address/);
  await assert.rejects(safeFetch("http://[::1]/", { maxBytes: 10 }), /private address/);
  await assert.rejects(safeFetch("file:///etc/passwd", { maxBytes: 10 }), /refusing file:/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name}\n${(err as Error).stack ?? err}`);
    }
  }
  console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
