import test from "node:test";
import assert from "node:assert/strict";
import { sampleShop } from "../src/lib/sample.ts";
import {
  BookingError,
  addBlock,
  addDays,
  availableSlots,
  book,
  cancelByCustomer,
  clock,
  firstOpenDate,
  normalizePhone,
  setStatus,
  shopNow,
  weekday,
} from "../src/lib/schedule.ts";
import type { Now } from "../src/lib/types.ts";

// 2026-11-02 is a Monday; the sample shop opens 10:00 to 21:00.
const now: Now = { date: "2026-11-02", minutes: 9 * 60 };
const ids = (n: number) => ({ id: `t${n}`, random: () => 0.5 });
const request = {
  serviceId: "cut",
  staffChoice: "youssef",
  date: "2026-11-02",
  start: 16 * 60,
  name: "Test Client",
  phone: "06 12 34 56 78",
};

test("slots respect opening hours, staff hours, bookings, blocks and lead time", () => {
  const shop = sampleShop(now);
  const youssef = availableSlots(shop, "cut", "youssef", now.date, now).map((s) => clock(s.start));
  assert.equal(youssef[0], "10:00");
  assert.equal(youssef.at(-1), "20:30"); // a 30-minute cut must end by 21:00
  assert.ok(!youssef.includes("11:00")); // his 11:00 fade runs to 11:45
  assert.ok(!youssef.includes("11:30")); // would run into the fade
  assert.ok(!youssef.includes("11:45")); // would run into his 12:00 beard trim
  assert.ok(youssef.includes("12:30")); // first start after the beard trim ends at 12:20
  assert.ok(!youssef.includes("14:30")); // lunch block 14:00 to 15:00
  // Anas works from 13:00 on Mondays and does not do fades.
  const anas = availableSlots(shop, "cut", "anas", now.date, now);
  assert.equal(clock(anas[0].start), "13:00");
  assert.equal(availableSlots(shop, "fade", "anas", now.date, now).length, 0);
  // Later in the day, nothing inside the 30-minute lead time.
  const late: Now = { date: now.date, minutes: 16 * 60 + 5 };
  const first = availableSlots(shop, "cut", "any", now.date, late)[0];
  assert.equal(clock(first.start), "16:45");
});

test("closed days and dates outside the booking window have no slots", () => {
  const shop = sampleShop(now);
  const sunday = addDays(now.date, 6);
  assert.equal(weekday(sunday), 0);
  assert.equal(availableSlots(shop, "cut", "any", sunday, now).length, 0);
  assert.equal(availableSlots(shop, "cut", "any", addDays(now.date, -1), now).length, 0);
  assert.equal(availableSlots(shop, "cut", "any", addDays(now.date, 14), now).length, 0);
  // Friday opens at 14:00.
  const friday = addDays(now.date, 4);
  assert.equal(clock(availableSlots(shop, "cut", "any", friday, now)[0].start), "14:00");
  assert.equal(firstOpenDate(shop, "cut", "any", { date: sunday, minutes: 600 }), addDays(sunday, 1));
});

test("anyone goes to the person with the lightest day", () => {
  const shop = sampleShop(now);
  const slot = availableSlots(shop, "beard", "any", now.date, now).find((s) => s.start === 16 * 60)!;
  // At 16:00 everyone is free; Anas has one booking today, the others have more.
  assert.deepEqual(slot.staffIds[0], "anas");
  const { booking } = book(shop, { ...request, serviceId: "beard", staffChoice: "any" }, now, ids(1));
  assert.equal(booking.staffId, "anas");
  assert.equal(booking.end, 16 * 60 + 20);
});

test("a slot can be booked once; the second request is refused", () => {
  const shop = sampleShop(now);
  const first = book(shop, request, now, ids(1));
  assert.equal(first.booking.status, "booked");
  assert.equal(first.booking.customer.phone, "212612345678");
  assert.equal(shop.bookings.length + 1, first.shop.bookings.length);
  assert.throws(() => book(first.shop, request, now, ids(2)), (e: BookingError) => e.code === "slot-taken");
  // Overlapping start in the same window is also refused.
  assert.throws(
    () => book(first.shop, { ...request, start: 16 * 60 + 15 }, now, ids(3)),
    (e: BookingError) => e.code === "slot-taken",
  );
  // A cancelled booking frees its slot again.
  const freed = setStatus(first.shop, first.booking.id, "cancelled");
  assert.equal(book(freed, request, now, ids(4)).booking.start, 16 * 60);
});

test("customer details and timing are validated", () => {
  const shop = sampleShop(now);
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as BookingError).code;
    }
  };
  assert.equal(code(() => book(shop, { ...request, name: " " }, now)), "name");
  assert.equal(code(() => book(shop, { ...request, phone: "12345" }, now)), "phone");
  assert.equal(code(() => book(shop, { ...request, start: 9 * 60 + 15 }, now)), "too-soon");
  assert.equal(code(() => book(shop, { ...request, date: addDays(now.date, 20) }, now)), "too-far");
  assert.equal(code(() => book(shop, { ...request, serviceId: "fade", staffChoice: "anas" }, now)), "staff");
  assert.equal(code(() => book(shop, { ...request, serviceId: "nope" }, now)), "service");
});

test("Moroccan numbers are read in every common spelling", () => {
  for (const v of ["0612345678", "06 12 34 56 78", "+212 6 12 34 56 78", "00212612345678", "212-612-345-678"])
    assert.equal(normalizePhone(v), "212612345678", v);
  assert.equal(normalizePhone("0522123456"), "212522123456");
  assert.equal(normalizePhone("0812345678"), null);
  assert.equal(normalizePhone("061234567"), null);
});

test("customers cancel with code and phone, never after the start", () => {
  const { shop, booking } = book(sampleShop(now), request, now, ids(1));
  assert.throws(() => cancelByCustomer(shop, booking.code, "0699999999", now), (e: BookingError) => e.code === "not-found");
  const cancelled = cancelByCustomer(shop, booking.code.toLowerCase(), "+212612345678", now);
  assert.equal(cancelled.bookings.find((b) => b.id === booking.id)!.status, "cancelled");
  const later: Now = { date: now.date, minutes: 16 * 60 + 1 };
  assert.throws(() => cancelByCustomer(shop, booking.code, "0612345678", later), (e: BookingError) => e.code === "not-cancellable");
});

test("blocked time cannot cover a live booking, and it removes slots", () => {
  const shop = sampleShop(now);
  assert.throws(
    () => addBlock(shop, { staffId: "youssef", date: now.date, start: 11 * 60, end: 11 * 60 + 30, reason: "" }),
    (e: BookingError) => e.code === "overlaps-booking",
  );
  const blocked = addBlock(shop, { staffId: "youssef", date: now.date, start: 18 * 60, end: 19 * 60, reason: " Errand " }, "x");
  assert.equal(blocked.blocks.at(-1)!.reason, "Errand");
  const times = availableSlots(blocked, "cut", "youssef", now.date, now).map((s) => clock(s.start));
  assert.ok(!times.includes("18:00") && !times.includes("17:45") && times.includes("19:00"));
});

test("the shop clock reads the shop's time zone, not the visitor's", () => {
  const at = new Date("2026-11-02T23:30:00Z");
  assert.deepEqual(shopNow(at, "UTC"), { date: "2026-11-02", minutes: 23 * 60 + 30 });
  assert.deepEqual(shopNow(at, "Asia/Tokyo"), { date: "2026-11-03", minutes: 8 * 60 + 30 });
  // Casablanca's offset changes around Ramadan; whatever it is, it matches Intl.
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  assert.equal(clock(shopNow(at).minutes), local);
});
