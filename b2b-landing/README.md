# The Operating Standard — Landing Page

Single-page static site, no build step, no dependencies. Built to catch traffic
from short-form content and send it to one action: book a strategy call.

## Running it locally

```bash
cd b2b-landing
python3 -m http.server 8080
```

Then open http://localhost:8080

## What to swap before launch

1. **Brand name / wordmark** — currently "The Operating Standard" in
   `index.html` (`.brand` and `<title>`). Replace if that's not the right name.
2. **VSL video** — in `index.html`, find `data-video-id="REPLACE_WITH_YOUTUBE_ID"`
   on the `#video-embed` div and swap in your YouTube video ID (the part after
   `v=` in a YouTube URL).
3. **Booking embed** — find `data-calendly-url="REPLACE_WITH_CALENDLY_URL"` on
   `.calendly-embed` and swap in your Calendly (or other scheduler) embed URL.
4. **Case studies** — the four placeholder cards under "Results you can
   actually verify" need real thumbnails, numbers, and links to the YouTube
   breakdowns. Replace the `<a class="proof-card">` blocks.
5. **FAQ copy** — generic objection-handling questions are in place; tighten
   these to match real objections you hear on calls.
6. **Analytics** — no tracking pixel is wired up. Add your Meta Pixel /
   TikTok Pixel / GA4 snippet in `<head>` so you can measure which short-form
   videos actually convert.

## Deploying

This is a static site — drop the `b2b-landing/` folder onto Vercel, Netlify,
Cloudflare Pages, or any static host. No build command needed; the publish
directory is the folder itself.

## Structure

```
index.html   all page content and sections
styles.css   dark theme, layout, responsive rules
script.js    swaps video/booking placeholders for real embeds at runtime
```
