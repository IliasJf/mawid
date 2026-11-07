# Mawid
[![Checks](https://github.com/IliasJf/mawid/actions/workflows/ci.yml/badge.svg)](https://github.com/IliasJf/mawid/actions/workflows/ci.yml)

**Mawid** (موعد, Arabic for "appointment") is online booking for small businesses in Morocco: barbershops, salons and small clinics. Customers open the link from Instagram or WhatsApp, pick a service, a person and a time on their phone, and get a confirmation they can send to the shop on WhatsApp. The owner sees the day as a sheet, one column per person.

**[Try the live demo](https://iliasjf.github.io/mawid/)** with a fictional Casablanca barbershop. Bookings stay in your browser. The owner view is at [`#/owner`](https://iliasjf.github.io/mawid/#/owner).

The same app runs for a real shop on a Cloudflare Worker with a D1 database: customers and the owner share one set of bookings, and the owner's side is behind a PIN. It's live at **[mawid.iliasjf.workers.dev](https://mawid.iliasjf.workers.dev/)**, still with the demo barbershop. See [Run it for a real shop](#run-it-for-a-real-shop).

## What it does

**For customers**
- Services with duration and price in dirhams, a choice of barber or "first available", two weeks of days and the free times on each.
- Name and a Moroccan mobile number, accepted in any common spelling (`06 12 34 56 78`, `+212 6…`, `00212…`).
- An appointment card with a short booking code, a prefilled WhatsApp message to the shop, and an `.ics` file for the phone's calendar.
- Move to another free time or cancel, with the code and the same number, until the start time. The code stays the same.
- The shop's address with a map link, call and WhatsApp buttons, and the opening hours for the week.
- English, French and Arabic (right to left), light and dark mode following the phone.

**For the owner**
- **Agenda:** the day as a sheet per barber, with breaks, time off and a line for now. Tap a booking to call the customer, mark it done, no-show or cancelled, or move it to another day, time or barber. On a phone the booking opens as a sheet from the bottom.
- **Phone calls and walk-ins:** the owner adds a booking from the agenda. The phone number is optional for a walk-in, and the owner isn't held to the lead time or the two-week window.
- **Undo** on every change. It puts back only what that change touched, so a booking made in the meantime isn't lost.
- **Block time** for lunch or an errand. It refuses to cover a booked customer.
- **Bookings:** upcoming, past or all, searchable by name, phone or code. Filters live in the URL.
- **Reminders:** tomorrow's customers, each with a WhatsApp reminder ready to send in one tap. The message has their time, barber and booking code, and a link to change or cancel. Sent ones are marked with the time.
- **Services and hours:** edit price, duration and what's offered; set opening hours per weekday.

## How times are worked out

`src/lib/schedule.ts` holds every rule, with no UI code, and is covered by tests:

- A barber is bookable inside the shop's hours for that weekday intersected with their own hours.
- Slots start on a 15-minute grid. A service must fit entirely before closing and must not overlap a booking or blocked time.
- Nothing inside the lead time (30 minutes) and nothing beyond the 14-day window.
- "First available" gives the booking to whoever has the lightest day.
- The slot is checked again at the moment of booking, so two people can't take the same time. A moved booking doesn't block its own old time.
- Times are the shop's wall clock in `Africa/Casablanca`, read through `Intl`, so Morocco's Ramadan clock change is handled by the time zone, not by a hard-coded offset.

## Run it

Node 22.6 or newer.

```sh
npm install
npm run dev        # the demo, http://127.0.0.1:5177
npm test           # engine and server tests
npm run typecheck
npm run build      # static demo in dist/ for /mawid/
```

To run the real-shop version on your computer, with its database:

```sh
cp .dev.vars.example .dev.vars   # a local PIN (4821) and session secret
npm run api                      # builds, sets up the local database, http://127.0.0.1:8787
```

## Run it for a real shop

One Worker serves the app and its API; the shop lives in a D1 database. Cloudflare's free plan covers a small shop.

1. **Set up the shop.** Edit `server/shop.config.ts`: name, address, WhatsApp number, opening hours, services, prices and team. The owner can change prices, durations and hours later from the dashboard.
2. **Sign in to Cloudflare:** `npx wrangler login`
3. **Create the database:** `npx wrangler d1 create mawid`, then paste the `database_id` it prints into `wrangler.jsonc`.
4. **Choose the owner's PIN and a signing secret:**
   ```sh
   npx wrangler secret put OWNER_PIN
   npx wrangler secret put SESSION_SECRET   # 32+ random characters
   ```
5. **Deploy:** `npm run deploy`. It builds, applies the database migrations and publishes to `https://mawid.<your-subdomain>.workers.dev`. Add the shop's own domain in the Cloudflare dashboard if it has one.

Give customers the main link (in the Instagram bio, on WhatsApp, on a QR code at the counter). The owner bookmarks the same link with `#/owner` and signs in once per phone; the session lasts 30 days.

### What the server does

- **Customers** see the services, the team and when each barber is busy, never anyone's name, number, note or booking code.
- **Every change** runs through the same rules as the demo (`src/lib/schedule.ts`, `src/lib/ops.ts`) on the shared copy, so a stale screen can't double-book. Two saves at the same moment both land: the second is redone on top of the first.
- **The owner** signs in with the PIN and gets a signed, HTTP-only cookie. Five wrong PINs from one address lock sign-in for 15 minutes.
- **Limits** per visitor address: 10 bookings and 30 booking lookups an hour.

## Structure

```
src/lib/schedule.ts   the booking engine: availability, booking, moving, cancelling, blocks
src/lib/ops.ts        owner changes as data, undo, and the public view of the shop
src/lib/store.ts      the shop in this browser (demo) or from the server (real shop)
src/lib/backend.ts    every change the pages make, run locally or sent to the server
src/lib/copy.ts       every string in English, French and Arabic
src/booking/          the customer pages: book, appointment card, manage
src/owner/            the owner dashboard: agenda, bookings, services, hours
src/styles/           design tokens (Coral, from the Hallmark design skill) and the app stylesheet
server/app.ts         the API: routes, PIN sign-in, limits, safe saves
server/shop.config.ts the shop a new deployment starts with
worker/index.ts       the Cloudflare Worker and its D1 storage
migrations/           the database tables
tests/                node:test tests for the engine and the API
```

## Limits

- The demo on GitHub Pages keeps bookings in the visitor's browser; only the Worker version shares them.
- Reminders are prefilled WhatsApp messages the owner sends with one tap each. Sending them automatically would need the WhatsApp Business API, which needs a Meta business account and paid message templates.
- The shop is one JSON document in D1, saved whole on each change. That's simple and safe for one shop with thousands of bookings; a chain of shops would want a table per record.
- The team (names, working days, who does which service) is set in `server/shop.config.ts`, not yet from the dashboard.
- The demo barbershop, its staff and its customers are fictional.

## License

MIT
