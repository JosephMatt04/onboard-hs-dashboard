# Risk Assessment video backgrounds

The Risk Assessment category buttons support **optional** locally packaged WebM video clips. This version includes the playback code, but **does not yet include licensed realistic video footage**. Until you add clips, the existing CSS background animations remain the fallback.

Place the following licensed, silent, short WebM videos under `onboard-hs-desktop-v4/app/assets/risk-videos/`:

- `electric-loop.webm` — realistic electrical arcs
- `fire-loop.webm` — realistic fire flames
- `lorry-loop.webm` — moving lorry
- `gears-loop.webm` — real industrial gears

Keep clips short (approximately 2–4 seconds), lightweight, muted and seamless, ideally with an aspect ratio suitable for a wide category button. Verify that footage is licensed for redistribution before committing it. The build must package these files inside the Electron app's `app` directory.

Playback starts on hover or keyboard focus and stops on exit. A contrast overlay preserves label visibility. Errors and absent files fall back to the existing CSS animation. Reduced-motion users do not get autoplay footage.

Do not use unverified remote streaming links for these buttons. The dashboard is designed to run offline.
