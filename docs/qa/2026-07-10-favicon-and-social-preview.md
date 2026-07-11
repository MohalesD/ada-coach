# QA — Favicon + SEO/social-preview metadata

Date: 2026-07-10
Task slug: favicon-and-social-preview

## Files changed

- `index.html` — favicon `<link>` set (SVG + PNG fallbacks + Apple touch icon + manifest + theme-color), canonical URL, refreshed meta description, full Open Graph block, full Twitter Card block.
- `public/favicon.svg` — hand-authored vector mark (source of truth for the favicon).
- `public/favicon-16x16.png`, `public/favicon-32x32.png` — rasterized from the SVG mark, rounded-square variant.
- `public/apple-touch-icon.png` (180×180) — rasterized from a flat-square (no pre-baked corner radius) variant, since iOS applies its own mask and pre-rounding causes double-rounding.
- `public/android-chrome-192x192.png`, `public/android-chrome-512x512.png` — PWA/manifest icons, rounded variant.
- `public/site.webmanifest` — minimal manifest referencing the two Android icon sizes, theme/background colors matching the app's CSS custom properties.
- `public/og-image.png` (1200×630) — the social share card.

## Design

**Favicon**: a bold geometric "A" monogram — apex notch, crossbar, flared legs — built as a single evenodd path plus a bridging rect, on a rounded square filled with the app's exact existing brand gradient (`#8B6324` → `#B8853A`, the same stops `.gradient-text` already uses on the in-app "Ada" wordmark) with the cream foreground (`#FAF7F0`) also pulled straight from the CSS custom properties. Deliberately geometric rather than trying to fake the Fraunces serif in a 16px glyph — verified legible at actual 16px render size before committing to the full size set (see Verification).

**OG image**: a 1200×630 share card built as a real HTML page and rendered via a headless browser (no font substitution) using the app's actual typefaces — Fraunces for the gradient "Ada" wordmark, Karla for the tracked-uppercase subtitle and body — reproducing the in-app header almost exactly, plus the same "Demo" pill introduced in the Phase 2 feedback-system polish work, a one-line explainer in Ada's actual coaching voice ("pressure-tests," "reframes leading questions," "surfaces the assumptions you didn't know you had" — pulled from the real system-prompt constraints, not invented marketing copy), and an oversized low-opacity ghost version of the mark bleeding off the right edge for texture.

## Why a headless-browser render instead of a design tool

No SVG rasterizer was available in this environment (no `sharp`, `cairosvg`, `rsvg-convert`, `inkscape` — checked before deciding). A headless Chromium instance (Playwright, already available as an MCP tool) screenshotting a real HTML/CSS/SVG page was the more reliable path anyway: it uses the project's actual web fonts loaded live rather than approximating them, and gives pixel-exact control over every target size (viewport resize → screenshot, no lossy raster scaling between sizes).

## Verification

- `npm run build` — clean (`tsc && vite build`); confirmed all new `public/` assets copy into `dist/` and `dist/index.html` carries every new tag.
- Dev server: `curl` confirmed `favicon.svg` (image/svg+xml), `og-image.png`, `apple-touch-icon.png`, and `site.webmanifest` (application/manifest+json) all return 200 with correct content-types.
- Pixel dimensions verified by reading each PNG's IHDR chunk directly: 16×16, 32×32, 180×180, 192×192, 512×512, and 1200×630 for the OG image — all exact, no off-by-one scaling.
- Favicon legibility spot-checked by rendering the mark at actual 16×16 before generating the rest of the set — confirmed it still reads clearly as "A", not just at preview size.
- Domain used throughout (`https://ada-coach.vercel.app`) confirmed against existing repo references (CORS `ALLOWED_ORIGINS` docs, security audit, PRDs) rather than assumed.
- Not independently verified: actual link-unfurl rendering inside Slack/WhatsApp/iMessage — those require the page to be publicly deployed and reachable by each platform's crawler, which can't be exercised from a local session. Once this ships to the real `ada-coach.vercel.app` deploy, worth pasting the link into Slack/WhatsApp once to confirm the crawler picked up the new `og:image` (some platforms cache old unfurls per-URL for a while; may need a fresh URL parameter or their debug tool to force a re-scrape).

## Quiz

**Q: Why does the Apple touch icon use a separate, non-rounded source image instead of just reusing the same rounded-square PNG the other icons use?**

A: iOS applies its own corner-mask (a superellipse, not a plain rounded rect) to whatever image is supplied as `apple-touch-icon`. Handing it an image that's already been rounded means iOS's mask crops into the mark's own rounded corners a second time, producing visible seams/artifacts at the corners. Supplying a flat square lets iOS's masking be the only rounding applied, which is the platform's documented expectation.

Quiz result: **pass**
