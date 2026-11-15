# Hearth — Home calendar card (v521)

Design record and setup for the Home calendar card. Confirmed with Cathal 15/11/2026: **a card on Home, today + the next 7 days, ONE Google Calendar (his), read-only.**

## How it works
- **`functions/api/calendar.js`** is a Cloudflare **Pages Function**. Pages builds anything under `functions/` automatically (no build command needed), and serves it at `/api/calendar` on the **same hostname as the app** — so the existing Cloudflare Access application gates it too. This is Hearth's first server-side code; Firebase is still the only data backend.
- It reads the calendar's **secret iCal address** from the Pages variable **`GCAL_ICS_URL`**, fetches it, expands recurrences into Irish time (`Europe/Dublin`) and returns `{ok, from, days:8, events:[{date, allDay, start, end, endDate?, cont?, title, location, multi?}]}`. No secret, or a non-`https` value → `503 {error:"not_configured"}`; Google failing → `502`. Every response is `Cache-Control: no-store`.
- **`sw.js` never touches `/api/`** (v521) — its cache-first branch would otherwise serve the first response forever. Pinned by `tests/sw-cases/05-sw-api-passthrough.js`.
- **The card** (`renderHomeCalendar` / `hcalPaint` in `src/js/20-home.js`) follows the weather card: device-local cache `hearthCalendar` (never synced, not backed up), refetched when older than 15 min, painted faded with "as of HH:MM" when stale, hidden when there is nothing at all. The Home clock's 15-second tick repaints it from cache (finished events drop off, midnight rolls over) and triggers the 15-minute refetch — that is what keeps the kitchen kiosk phone current. Test builds and previews paint a fixed demo week and never call the network.
- Names are **`hcal*`**, not `cal*` — `cal*`/`renderCal*` in `11-recipes-tools.js` are the recipe batch-cook helper, and `homeCalState` is the calories card.

## Setup (Cathal, once — Cloudflare dashboard)
1. Google Calendar on a computer → ⚙️ Settings → under "Settings for my calendars" pick the calendar → **Integrate calendar** → copy **Secret address in iCal format**.
2. Cloudflare → **Workers & Pages** → the Hearth Pages project → **Settings → Variables and Secrets** → **Add** → type **Secret**, name **`GCAL_ICS_URL`**, value = that address → Save. Set it for **Production**.
3. Redeploy (Deployments → latest → ⋯ → Retry deployment), or just merge the next PR. Variables only reach new deployments.
4. Open Hearth → Home. Until step 2 is done the card says "Calendar isn't connected yet."

**Never put the secret address in the repo** — the repo is public (`HEARTH-cloudflare-access.md` decision 2). Anyone with that address can read the calendar; if it leaks, Google's same screen has **Reset**.

## Decisions on record
- **Do NOT fetch Google from the page.** Google sends no CORS headers, and the address would have to sit in public code.
- **Do NOT cache `/api/` in the service worker.** The page keeps its own last-good copy for offline.
- **Do NOT sync the cached events through Firebase.** Each phone fetches its own; the calendar is already the source of truth.
- More calendars later = more variables plus a `cal` field per event for colour; deliberately not built (Cathal chose one).
- The parser covers what Google emits (DATE/DATE-TIME, TZID/UTC/floating, DTEND/DURATION, RRULE DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH/WKST, EXDATE, RECURRENCE-ID moves and cancellations, STATUS:CANCELLED). Rarer rule parts (BYSETPOS, BYWEEKNO…) show the first date only rather than guessing. Pinned by `tests/cases/97-home-calendar.js`, which loads the function in Node.
- **A series repeats in its OWN zone (UTC included) and is converted to Irish time per occurrence** — converting the first start and repeating in Irish time shifts a `…Z` weekly slot by an hour after the clocks change. **The card compares against Irish time (`hcalNow`), not the phone's clock**, because every event comes back in `Europe/Dublin`. A timed event's `endDate` is its real end date, so one ending at 00:00 belongs to the next day. All three were Codex findings on #294, fixed before merge.

## Troubleshooting (v523)
Open `/api/calendar` on the live site in a signed-in browser. The `feed` block says what Google sent:
- `summary.calendar` / `summary.events` — which calendar the address belongs to and how many events it holds in total. **0 events** = the feed itself is empty (wrong calendar, or the *public* address of a private calendar, which Google serves empty). `newestStart` shows how recent its latest event is — if that is older than events you just added, Google's feed hasn't caught up yet (it can lag by hours).
- `error: "not_ical"` with a `pageTitle` — Google sent a web page, not a calendar: the address is wrong or was reset. Copy the **Secret address in iCal format** again.
- `error: "upstream"` with `feed.status` — Google refused (404 = address no longer valid).
