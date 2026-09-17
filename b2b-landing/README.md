# Operating Standard — Landing Page

Single-page static site, no build step, no dependencies. Built to catch traffic
from short-form content and send it to one action: apply for a strategy call.

Current funnel (no VSL yet): land → read the offer and who it's for →
apply via the embedded Typeform (qualifies on client-list size × average
ticket) → get booked.

## Running it locally

```bash
cd b2b-landing
python3 -m http.server 8080
```

Then open http://localhost:8080

## What's live

- **Copy** — matches the real offer from the client-journey roadmap:
  bottleneck diagnosis across sales/marketing/team/systems, cash recovered
  from an existing client list before any ad spend, a 6-month roadmap.
- **Application form** — the real Typeform (`form.typeform.com/to/PWaKaqFW`)
  is embedded live in the `#apply` section. All CTAs scroll there instead of
  linking out, so the applicant never leaves the page.
- **Qualification section** — "Who this is actually for" mirrors the real
  screening math: client list × average ticket ≥ $125,000, med spas /
  aesthetic clinics / high-end salons / physio / dental / PT / trades.
- **Brand** — real logo (`assets/logo.png`) used as favicon and hero mark;
  black/cream/gold theme with serif headings (Playfair Display) to match it.
- **Proof section** — since there are no client testimonials yet (the
  business just started), proof is the founder's own track record instead:
  building ZOLF from an empty 6-chair salon alone, ~$100K invested, going
  from solo operator to a systemized business, ~100K followers documenting
  it in real time, and real Square revenue — $104,266 for all of 2025 vs.
  $300,107 for Jan–Sep 2026 alone (Q4 not even in that number yet). No
  forward-looking projection is stated on the page — only verified,
  already-happened numbers, from the real Founder's Profile doc and Square
  dashboard, not invented. Links out to the real Instagram so it's checkable.

## Deliberately left out for now

No VSL is on the page — none exists yet, and a placeholder video would
undercut a page that's otherwise built on real, checkable specifics. When
one exists:

1. **VSL** — add a video section back into the hero in `index.html`
   (a 16:9 embed pointed at the real YouTube video), plus an "Apply" CTA
   underneath it.
2. **Client case studies** — once real clients exist, add a second proof
   section alongside the founder-story one with their results.
3. **Analytics** — add a Meta Pixel / TikTok Pixel / GA4 snippet in `<head>`
   once you're actually running short-form traffic to this page, so you can
   tell which videos drive Typeform completions.

## Typeform → booking handoff

This page only embeds the application form. Whether a completed application
redirects to a calendar, or you review applications manually before booking,
is configured inside Typeform itself (Connect panel), not in this repo.

## Deploying

This is a static site — drop the `b2b-landing/` folder onto Vercel, Netlify,
Cloudflare Pages, or any static host. No build command needed; the publish
directory is the folder itself.

## Structure

```
index.html   all page content and sections
styles.css   dark theme, layout, responsive rules
script.js    sets the footer's copyright year
assets/      logo.png (favicon + hero mark)
```
