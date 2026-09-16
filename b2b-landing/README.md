# The Operating Standard — Landing Page

Single-page static site, no build step, no dependencies. Built to catch traffic
from short-form content and send it to one action: apply for a strategy call.

Funnel: land → watch VSL → apply via the embedded Typeform (qualifies on
client-list size × average ticket) → get booked.

## Running it locally

```bash
cd b2b-landing
python3 -m http.server 8080
```

Then open http://localhost:8080

## Already wired in

- **Application form** — the real Typeform (`form.typeform.com/to/PWaKaqFW`)
  is embedded live in the `#apply` section. All CTAs scroll there instead of
  linking out, so the applicant never leaves the page.
- **Qualification copy** — the "Who this is actually for" section mirrors the
  real screening math from the client-journey doc: client list × average
  ticket ≥ $125,000, med spas / aesthetic clinics / high-end salons / physio /
  dental / PT / trades. This should reduce unqualified Typeform submissions,
  not just filter them after the fact.

## What's still a placeholder

1. **Brand name / wordmark** — "The Operating Standard" in `index.html`
   (`.brand` and `<title>`). Confirm this is the right name before launch.
2. **VSL video** — find `data-video-id="REPLACE_WITH_YOUTUBE_ID"` on the
   `#video-embed` div in `index.html` and swap in your YouTube video ID (the
   part after `v=` in a YouTube URL).
3. **Case studies** — the four placeholder cards under "Results you can
   actually verify" need real thumbnails, numbers, and links to the YouTube
   breakdowns. Replace the `<a class="proof-card">` blocks. Don't publish
   with fake-looking placeholder numbers — no proof section beats a fake one.
4. **Analytics** — no tracking pixel is wired up yet. Add your Meta Pixel /
   TikTok Pixel / GA4 snippet in `<head>` so you can tell which short-form
   videos are actually driving Typeform completions.
5. **Typeform → booking handoff** — this page only embeds the application
   form. Whether a completed application redirects to a calendar, or you
   review applications manually before booking, is configured inside
   Typeform itself (Connect panel), not in this repo.

## Deploying

This is a static site — drop the `b2b-landing/` folder onto Vercel, Netlify,
Cloudflare Pages, or any static host. No build command needed; the publish
directory is the folder itself.

## Structure

```
index.html   all page content and sections
styles.css   dark theme, layout, responsive rules
script.js    swaps the VSL placeholder for a real YouTube embed at runtime
```
