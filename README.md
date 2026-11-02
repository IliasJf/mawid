# Mawid

**Mawid** (موعد, Arabic for "appointment") is online booking for small businesses in Morocco: barbershops, salons and small clinics. Customers open the link from Instagram or WhatsApp, pick a service, a person and a time on their phone, and get a confirmation they can send to the shop on WhatsApp. The owner sees the day as a sheet, one column per person.

**[Try the live demo](https://iliasjf.github.io/mawid/)** with a fictional Casablanca barbershop. Bookings stay in your browser. The owner view is at [`#/owner`](https://iliasjf.github.io/mawid/#/owner).

## What it does

**For customers**
- Services with duration and price in dirhams, a choice of barber or "first available", two weeks of days and the free times on each.
- Name and a Moroccan mobile number, accepted in any common spelling (`06 12 34 56 78`, `+212 6…`, `00212…`).
- An appointment card with a short booking code, a prefilled WhatsApp message to the shop, and an `.ics` file for the phone's calendar.
- Change or cancel with the code and the same number, until the start time.
- English, French and Arabic (right to left), light and dark mode following the phone.

**For the owner**
- **Agenda:** the day as a sheet per barber, with breaks, time off and a line for now. Tap a booking to call the customer or mark it done, no-show or cancelled, with undo.
- **Block time** for lunch or an errand. It refuses to cover a booked customer.
- **Bookings:** upcoming, past or all, searchable by name, phone or code. Filters live in the URL.
- **Services and hours:** edit price, duration and what's offered; set opening hours per weekday.

## How times are worked out

`src/lib/schedule.ts` holds every rule, with no UI code, and is covered by tests:

- A barber is bookable inside the shop's hours for that weekday intersected with their own hours.
- Slots start on a 15-minute grid. A service must fit entirely before closing and must not overlap a booking or blocked time.
- Nothing inside the lead time (30 minutes) and nothing beyond the 14-day window.
- "First available" gives the booking to whoever has the lightest day.
- The slot is checked again at the moment of booking, so two people can't take the same time.
- Times are the shop's wall clock in `Africa/Casablanca`, read through `Intl`, so Morocco's Ramadan clock change is handled by the time zone, not by a hard-coded offset.

## Run it

Node 22.6 or newer.

```sh
npm install
npm run dev        # http://127.0.0.1:5177
npm test           # booking engine tests
npm run typecheck
npm run build      # static build in dist/ for /mawid/
```

## Structure

```
src/lib/schedule.ts   the booking engine: availability, booking, cancelling, blocks
src/lib/store.ts      saves the shop in localStorage and syncs open tabs
src/lib/copy.ts       every string in English, French and Arabic
src/booking/          the customer pages: book, appointment card, manage
src/owner/            the owner dashboard: agenda, bookings, services, hours
src/styles/           design tokens (Coral, from the Hallmark design skill) and the app stylesheet
tests/                node:test tests for the engine
```

## Limits

This is a front-end demo. Bookings are saved in the visitor's browser, so customers and the owner only share them on the same device. A real deployment swaps `src/lib/store.ts` for an API with the same three calls (read, write, subscribe) and checks the slot again on the server. WhatsApp messages are prefilled links the customer sends; automatic reminders would need the WhatsApp Business API. The barbershop, its staff and its customers are fictional.

## License

MIT
