# Utah Snow

A private, link-only ski dashboard for one crew's Utah Ikon trip: resort reports, road and avalanche
conditions, forecasts, live cams and a day-by-day pass tracker, at https://utah.otakar.dev.

Status: early build. The site shell and health checks work; data sources are being added now.

## Using it
- **Briefing**: the morning view. It shows the crew pick (where the people skiing today should go)
  with its reasons and alternatives. Flip "as me" to re-run the pick for just you.
- **Tracker**: who skis where on which day, plus bookings. Ikon cap-group days are counted for you.
- **Wall**: a TV view that rotates cams and conditions. Cast a dedicated browser window, not a tab you
  will switch away from.
- **Settings**: your base (a preset or a custom spot), units, theme, who is going today, and "me".

The site is not indexed and sends no referrer. Please do not post the link publicly.

## Maintainer setup
1. Node 24 and pnpm 12, then `pnpm install` and `pnpm exec playwright install chromium webkit`.
2. `pnpm wrangler login` (the otakar.dev zone lives in the same Cloudflare account).
3. Copy `.dev.vars.example` to `.dev.vars` and fill in values locally. Never commit it.
   - Worker secrets: `IP_HASH_SALT`, `PROBE_KEY` (required); `YT_API_KEY`, `UDOT_API_KEY` (optional).
   - GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PROBE_KEY`.
4. `pnpm dev` for local work, `pnpm check` before every commit. Deploys run from CI on `main`.

## Data sources
Resort data comes from each resort's public pages and APIs (Alta, Snowbird, Brighton, Solitude,
Deer Valley, Snowbasin), weather from the National Weather Service and Open-Meteo, snowpack from
NRCS SNOTEL, avalanche forecasts from the Utah Avalanche Center, roads and cameras from UDOT, and
cams from the resorts and their camera providers. All data belongs to its owners; this site only
links and summarizes it.

## License
MIT, see `LICENSE`.
