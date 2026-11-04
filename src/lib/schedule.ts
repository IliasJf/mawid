import type {
  Block,
  Booking,
  BookingStatus,
  DayHours,
  Minutes,
  Now,
  Service,
  Shop,
  Staff,
} from "./types.ts";

/** A rule the request broke. `code` picks the message in each language. */
export class BookingError extends Error {
  code: BookingErrorCode;
  constructor(code: BookingErrorCode) {
    super(code);
    this.code = code;
  }
}
export type BookingErrorCode =
  | "slot-taken"
  | "name"
  | "phone"
  | "service"
  | "staff"
  | "closed"
  | "too-soon"
  | "too-far"
  | "overlaps-booking"
  | "block-range"
  | "not-found"
  | "not-cancellable"
  | "not-changeable";

/**
 * Who is asking. Customers get the lead time and the booking window; the owner
 * books calls and walk-ins at any free time from today on.
 */
export type Actor = "customer" | "owner";
export interface SlotOptions {
  by?: Actor;
  /** A booking being moved: its own time doesn't count as taken. */
  ignore?: string;
}

// ---------- time ----------

export const pad = (n: number) => String(n).padStart(2, "0");
export const clock = (m: Minutes) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export function parseClock(value: string): Minutes {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return NaN;
  const h = Number(match[1]),
    m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekday = (date: string) => new Date(date + "T12:00:00Z").getUTCDay();
export const isDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v;

/** The shop's wall clock. Morocco moves its clocks for Ramadan, so ask the time zone. */
export function shopNow(at = new Date(), timeZone = "Africa/Casablanca"): Now {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

// ---------- availability ----------

const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** When this person works on this date: the shop's hours and theirs, intersected. */
export function workWindow(shop: Shop, staff: Staff, date: string): DayHours {
  const day = weekday(date),
    open = shop.business.hours[day],
    own = staff.hours[day];
  if (!open || !own) return null;
  const start = Math.max(open[0], own[0]),
    end = Math.min(open[1], own[1]);
  return start < end ? [start, end] : null;
}

/** Bookings and blocks that occupy this person's time on this date. */
export function busy(shop: Shop, staffId: string, date: string, ignore?: string) {
  return [
    ...shop.bookings.filter(
      (b) => b.staffId === staffId && b.date === date && b.status !== "cancelled" && b.id !== ignore,
    ),
    ...shop.blocks.filter((b) => b.staffId === staffId && b.date === date),
  ];
}

export function staffFor(shop: Shop, serviceId: string) {
  return shop.staff.filter((s) => s.active && s.serviceIds.includes(serviceId));
}

export function bookableDates(shop: Shop, now: Now) {
  return Array.from({ length: shop.business.horizonDays }, (_, i) =>
    addDays(now.date, i),
  );
}

/** Is this person free for [start, end) on this date, given the rules and now? */
export function isFree(
  shop: Shop,
  staff: Staff,
  date: string,
  start: Minutes,
  end: Minutes,
  now: Now,
  options: SlotOptions = {},
): boolean {
  const window = workWindow(shop, staff, date);
  if (!window || start < window[0] || end > window[1]) return false;
  if (date < now.date) return false;
  // Customers need the lead time; the owner can still take the slot that's under way, for a walk-in.
  const earliest =
    options.by === "owner"
      ? now.minutes - shop.business.slotStep + 1
      : now.minutes + shop.business.leadMinutes;
  if (date === now.date && start < earliest) return false;
  return !busy(shop, staff.id, date, options.ignore).some((b) =>
    overlaps(start, end, b.start, b.end),
  );
}

export interface Slot {
  start: Minutes;
  /** Everyone who could take it; the first is who "anyone" books. */
  staffIds: string[];
}

/** Start times for a service on a date, for one person or for anyone ("any"). */
export function availableSlots(
  shop: Shop,
  serviceId: string,
  staffChoice: string,
  date: string,
  now: Now,
  options: SlotOptions = {},
): Slot[] {
  const service = shop.services.find((s) => s.id === serviceId && s.active);
  if (!service) return [];
  const last = addDays(now.date, shop.business.horizonDays - 1);
  if (date < now.date || (options.by !== "owner" && date > last)) return [];
  const people = staffFor(shop, serviceId).filter(
    (s) => staffChoice === "any" || s.id === staffChoice,
  );
  const slots = new Map<Minutes, string[]>();
  for (const person of people) {
    const window = workWindow(shop, person, date);
    if (!window) continue;
    for (
      let start = Math.ceil(window[0] / shop.business.slotStep) * shop.business.slotStep;
      start + service.minutes <= window[1];
      start += shop.business.slotStep
    )
      if (isFree(shop, person, date, start, start + service.minutes, now, options))
        slots.set(start, [...(slots.get(start) ?? []), person.id]);
  }
  // "Anyone" goes to whoever has the lightest day, so work spreads evenly.
  const load = (id: string) => busy(shop, id, date).length;
  return [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, staffIds]) => ({
      start,
      staffIds: staffIds.sort((a, b) => load(a) - load(b)),
    }));
}

/** The first date from today with at least one slot, for "next available". */
export function firstOpenDate(
  shop: Shop,
  serviceId: string,
  staffChoice: string,
  now: Now,
) {
  return bookableDates(shop, now).find(
    (d) => availableSlots(shop, serviceId, staffChoice, d, now).length > 0,
  );
}

// ---------- customers ----------

/** Moroccan mobile and landline numbers, in any common spelling, as 212XXXXXXXXX. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s.\-()]/g, "");
  const match = /^(?:\+212|00212|212|0)([5-7]\d{8})$/.exec(digits);
  return match ? "212" + match[1] : null;
}
export const displayPhone = (p: string) =>
  !p ? "" : `0${p.slice(3, 4)} ${p.slice(4, 6)} ${p.slice(6, 8)} ${p.slice(8, 10)} ${p.slice(10, 12)}`;

const CODE_LETTERS = "ACDEFGHJKMNPQRTUVWXY34679";
export function newCode(taken: Set<string>, random = Math.random) {
  const pick = (r: number) => CODE_LETTERS[Math.floor(r * CODE_LETTERS.length) % CODE_LETTERS.length];
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Array.from({ length: 6 }, () => pick(random())).join("");
    if (!taken.has(code)) return code;
  }
  // A stuck or poor random source: walk the code space instead of looping forever.
  for (let n = taken.size; ; n++) {
    let code = "";
    for (let i = 0, v = n; i < 6; i++, v = Math.floor(v / CODE_LETTERS.length))
      code += CODE_LETTERS[v % CODE_LETTERS.length];
    if (!taken.has(code)) return code;
  }
}

// ---------- commands (each returns a new shop; the input is never changed) ----------

export interface BookingRequest {
  serviceId: string;
  staffChoice: string;
  date: string;
  start: Minutes;
  name: string;
  /** May be empty when the owner books a walk-in. */
  phone: string;
  note?: string;
  by?: Actor;
}

/** The date rules every booking and every move goes through. */
function checkDate(shop: Shop, date: string, start: Minutes, now: Now, by: Actor) {
  if (!isDate(date)) throw new BookingError("closed");
  if (by === "customer" && date > addDays(now.date, shop.business.horizonDays - 1))
    throw new BookingError("too-far");
  if (
    date < now.date ||
    (date === now.date &&
      start < (by === "customer" ? now.minutes + shop.business.leadMinutes : now.minutes - shop.business.slotStep + 1))
  )
    throw new BookingError("too-soon");
}

export function book(
  shop: Shop,
  request: BookingRequest,
  now: Now,
  ids: { id: string; random: () => number } = { id: crypto.randomUUID(), random: Math.random },
): { shop: Shop; booking: Booking } {
  const service = shop.services.find((s) => s.id === request.serviceId && s.active);
  if (!service) throw new BookingError("service");
  const name = request.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new BookingError("name");
  const by = request.by ?? "customer";
  const walkIn = by === "owner" && !request.phone.trim();
  const phone = walkIn ? "" : normalizePhone(request.phone);
  if (phone === null) throw new BookingError("phone");
  checkDate(shop, request.date, request.start, now, by);
  if (
    request.staffChoice !== "any" &&
    !staffFor(shop, service.id).some((s) => s.id === request.staffChoice)
  )
    throw new BookingError("staff");
  // Checked again at the moment of booking: someone may have taken it since the list was drawn.
  const slot = availableSlots(
    shop,
    service.id,
    request.staffChoice,
    request.date,
    now,
    { by },
  ).find((s) => s.start === request.start);
  if (!slot) throw new BookingError("slot-taken");
  const booking: Booking = {
    id: ids.id,
    code: newCode(new Set(shop.bookings.map((b) => b.code)), ids.random),
    serviceId: service.id,
    staffId: slot.staffIds[0],
    date: request.date,
    start: request.start,
    end: request.start + service.minutes,
    customer: { name, phone },
    note: (request.note ?? "").trim().slice(0, 300),
    status: "booked",
    createdAt: `${now.date}T${clock(now.minutes)}`,
  };
  return { shop: { ...shop, bookings: [...shop.bookings, booking] }, booking };
}

export function findBooking(shop: Shop, code: string, phone: string) {
  const normalized = normalizePhone(phone);
  return shop.bookings.find(
    (b) =>
      b.code === code.trim().toUpperCase() && b.customer.phone === normalized,
  );
}

const started = (b: Booking, now: Now) =>
  b.date < now.date || (b.date === now.date && b.start <= now.minutes);

/** A customer cancels with their code and phone, until it starts. */
export function cancelByCustomer(shop: Shop, code: string, phone: string, now: Now) {
  const booking = findBooking(shop, code, phone);
  if (!booking) throw new BookingError("not-found");
  if (booking.status !== "booked" || started(booking, now))
    throw new BookingError("not-cancellable");
  return setStatus(shop, booking.id, "cancelled");
}

export interface Move {
  date: string;
  start: Minutes;
  staffChoice: string;
}

/**
 * A booking moves to another free time and keeps its code. With "any" it stays
 * with the same barber when they're free then.
 */
export function moveBooking(
  shop: Shop,
  id: string,
  move: Move,
  now: Now,
  by: Actor = "owner",
): { shop: Shop; booking: Booking } {
  const booking = shop.bookings.find((b) => b.id === id);
  if (!booking) throw new BookingError("not-found");
  if (booking.status !== "booked" || (by === "customer" && started(booking, now)))
    throw new BookingError("not-changeable");
  const service = shop.services.find((s) => s.id === booking.serviceId && s.active);
  if (!service) throw new BookingError("service");
  checkDate(shop, move.date, move.start, now, by);
  if (move.staffChoice !== "any" && !staffFor(shop, service.id).some((s) => s.id === move.staffChoice))
    throw new BookingError("staff");
  const slot = availableSlots(shop, service.id, move.staffChoice, move.date, now, { by, ignore: id }).find(
    (s) => s.start === move.start,
  );
  if (!slot) throw new BookingError("slot-taken");
  const moved: Booking = {
    ...booking,
    date: move.date,
    start: move.start,
    end: move.start + service.minutes,
    staffId: slot.staffIds.includes(booking.staffId) ? booking.staffId : slot.staffIds[0],
  };
  return { shop: { ...shop, bookings: shop.bookings.map((b) => (b.id === id ? moved : b)) }, booking: moved };
}

/** A customer moves their own booking with their code and phone, until it starts. */
export function moveByCustomer(shop: Shop, code: string, phone: string, move: Move, now: Now) {
  const booking = findBooking(shop, code, phone);
  if (!booking) throw new BookingError("not-found");
  return moveBooking(shop, booking.id, move, now, "customer");
}

export function setStatus(shop: Shop, id: string, status: BookingStatus): Shop {
  if (!shop.bookings.some((b) => b.id === id)) throw new BookingError("not-found");
  return {
    ...shop,
    bookings: shop.bookings.map((b) => (b.id === id ? { ...b, status } : b)),
  };
}

/** The owner blocks time off (a break, an errand). It may not cover a live booking. */
export function addBlock(shop: Shop, block: Omit<Block, "id">, id: string = crypto.randomUUID()): Shop {
  if (!isDate(block.date) || !(block.start < block.end) || block.start < 0 || block.end > 24 * 60)
    throw new BookingError("block-range");
  if (!shop.staff.some((s) => s.id === block.staffId)) throw new BookingError("staff");
  if (
    shop.bookings.some(
      (b) =>
        b.staffId === block.staffId &&
        b.date === block.date &&
        b.status === "booked" &&
        overlaps(block.start, block.end, b.start, b.end),
    )
  )
    throw new BookingError("overlaps-booking");
  return {
    ...shop,
    blocks: [...shop.blocks, { ...block, reason: block.reason.trim().slice(0, 80), id }],
  };
}
export const removeBlock = (shop: Shop, id: string): Shop => ({
  ...shop,
  blocks: shop.blocks.filter((b) => b.id !== id),
});

export function updateService(shop: Shop, service: Service): Shop {
  if (!(service.minutes >= 5 && service.minutes <= 480 && service.minutes % 5 === 0))
    throw new BookingError("block-range");
  if (!(Number.isInteger(service.price) && service.price >= 0 && service.price <= 100000))
    throw new BookingError("block-range");
  return {
    ...shop,
    services: shop.services.map((s) => (s.id === service.id ? service : s)),
  };
}

/**
 * Undoes one change without losing others made since (a booking from another
 * tab, say): only the records that change touched go back to how they were.
 */
export function revert(current: Shop, before: Shop, after: Shop): Shop {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  function back<T extends { id: string }>(now: T[], was: T[], became: T[]): T[] {
    let out = now;
    for (const id of new Set([...was, ...became].map((x) => x.id))) {
      const old = was.find((x) => x.id === id);
      if (same(old, became.find((x) => x.id === id))) continue;
      if (!old) out = out.filter((x) => x.id !== id);
      else out = out.some((x) => x.id === id) ? out.map((x) => (x.id === id ? old : x)) : [...out, old];
    }
    return out;
  }
  return {
    ...current,
    business: same(before.business, after.business) ? current.business : before.business,
    services: back(current.services, before.services, after.services),
    staff: back(current.staff, before.staff, after.staff),
    bookings: back(current.bookings, before.bookings, after.bookings),
    blocks: back(current.blocks, before.blocks, after.blocks),
  };
}

export const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m / 60} h`;
