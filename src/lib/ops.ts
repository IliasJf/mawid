import {
  BookingError,
  addBlock,
  book,
  moveBooking,
  removeBlock,
  revert,
  setStatus,
  shopNow,
  updateService,
  type BookingRequest,
  type Move,
} from "./schedule.ts";
import type { Block, Booking, BookingStatus, Now, Service, Shop, WeekHours } from "./types.ts";

/**
 * Every change the owner can make, as data. The browser demo applies it to the
 * shop in localStorage; the server applies it to the shop in its database. Both
 * run the same rules, so a stale screen can't slip past them.
 */
export type OwnerOp =
  | { type: "book"; request: BookingRequest }
  | { type: "move"; id: string; move: Move }
  | { type: "status"; id: string; status: BookingStatus }
  | { type: "block"; block: Omit<Block, "id"> }
  | { type: "unblock"; id: string }
  | { type: "service"; service: Service }
  | { type: "hours"; hours: WeekHours }
  | { type: "reminded"; id: string }
  /** Undo: only the records in `before`/`after` go back (see changeOf). */
  | { type: "revert"; before: Shop; after: Shop };

export interface Ids {
  id: string;
  random: () => number;
}
export const freshIds = (): Ids => ({ id: crypto.randomUUID(), random: Math.random });

const STATUSES: BookingStatus[] = ["booked", "done", "no-show", "cancelled"];
const isMinutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 24 * 60;

function validHours(hours: unknown): hours is WeekHours {
  return (
    Array.isArray(hours) &&
    hours.length === 7 &&
    hours.every((d) => d === null || (Array.isArray(d) && d.length === 2 && isMinutes(d[0]) && isMinutes(d[1]) && d[0] < d[1]))
  );
}

export function applyOwnerOp(shop: Shop, op: OwnerOp, now: Now, ids: Ids = freshIds()): { shop: Shop; booking?: Booking } {
  switch (op.type) {
    case "book":
      return book(shop, { ...op.request, by: "owner" }, now, ids);
    case "move":
      return moveBooking(shop, op.id, op.move, now, "owner");
    case "status":
      if (!STATUSES.includes(op.status)) throw new BookingError("not-found");
      return { shop: setStatus(shop, op.id, op.status) };
    case "block":
      return { shop: addBlock(shop, op.block, ids.id) };
    case "unblock":
      return { shop: removeBlock(shop, op.id) };
    case "service": {
      const current = shop.services.find((s) => s.id === op.service.id);
      if (!current) throw new BookingError("service");
      // Only what the owner screen edits; the id and names stay as they are.
      const { minutes, price, active } = op.service;
      return { shop: updateService(shop, { ...current, minutes, price, active: !!active }) };
    }
    case "hours":
      if (!validHours(op.hours)) throw new BookingError("block-range");
      return { shop: { ...shop, business: { ...shop.business, hours: op.hours } } };
    case "reminded": {
      if (!shop.bookings.some((b) => b.id === op.id)) throw new BookingError("not-found");
      const at = `${now.date}T${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(now.minutes % 60).padStart(2, "0")}`;
      return { shop: { ...shop, bookings: shop.bookings.map((b) => (b.id === op.id ? { ...b, remindedAt: at } : b)) } };
    }
    case "revert":
      return { shop: revert(shop, op.before, op.after) };
  }
}

/** Applies an owner change and says how to undo exactly that change, nothing made around it. */
export function runOwnerOp(shop: Shop, op: OwnerOp, now: Now, ids: Ids = freshIds()) {
  const result = applyOwnerOp(shop, op, now, ids);
  return { ...result, undo: changeOf(shop, result.shop) };
}

/**
 * Just the records one change touched, before and after, for its undo. Sending
 * these instead of two whole shops keeps the request small.
 */
export function changeOf(before: Shop, after: Shop): { before: Shop; after: Shop } {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  function pick<T extends { id: string }>(was: T[], became: T[]): [T[], T[]] {
    const ids = new Set(
      [...was, ...became]
        .map((x) => x.id)
        .filter((id) => !same(was.find((x) => x.id === id), became.find((x) => x.id === id))),
    );
    return [was.filter((x) => ids.has(x.id)), became.filter((x) => ids.has(x.id))];
  }
  const [s0, s1] = pick(before.services, after.services);
  const [t0, t1] = pick(before.staff, after.staff);
  const [b0, b1] = pick(before.bookings, after.bookings);
  const [k0, k1] = pick(before.blocks, after.blocks);
  return {
    before: { ...before, services: s0, staff: t0, bookings: b0, blocks: k0 },
    after: { ...after, services: s1, staff: t1, bookings: b1, blocks: k1 },
  };
}

/**
 * What a customer's browser may see: the shop, its services and team, and when
 * each barber is busy. No names, phone numbers, notes or booking codes.
 */
export function publicShop(shop: Shop, now: Now = shopNow()): Shop {
  return {
    ...shop,
    bookings: shop.bookings
      .filter((b) => b.status !== "cancelled" && b.date >= now.date)
      .map((b) => ({
        id: b.id,
        code: "",
        serviceId: b.serviceId,
        staffId: b.staffId,
        date: b.date,
        start: b.start,
        end: b.end,
        customer: { name: "", phone: "" },
        note: "",
        status: b.status,
        createdAt: "",
      })),
    blocks: shop.blocks.filter((b) => b.date >= now.date).map((b) => ({ ...b, reason: "" })),
  };
}
