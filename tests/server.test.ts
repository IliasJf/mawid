import test from "node:test";
import assert from "node:assert/strict";
import { handle, type Deps, type Store } from "../server/app.ts";
import { changeOf } from "../src/lib/ops.ts";
import { sampleShop } from "../src/lib/sample.ts";
import { shopNow } from "../src/lib/schedule.ts";
import type { Shop } from "../src/lib/types.ts";

// Monday 2 November 2026, 09:00 in Casablanca (UTC+1).
const at = new Date("2026-11-02T08:00:00Z");

function memoryStore(): Store & { saves: number } {
  let row: { version: number; data: string } | null = null;
  const hits: { key: string; at: number }[] = [];
  return {
    saves: 0,
    async read() {
      return row && { version: row.version, shop: JSON.parse(row.data) };
    },
    async write(version, shop) {
      if ((row?.version ?? null) !== version) return false;
      row = { version: (version ?? 0) + 1, data: JSON.stringify(shop) };
      this.saves++;
      return true;
    },
    async hit(key, seconds) {
      const now = at.getTime();
      hits.push({ key, at: now });
      return hits.filter((h) => h.key === key && h.at > now - seconds * 1000).length;
    },
  };
}

function setup(): Deps & { store: ReturnType<typeof memoryStore> } {
  return {
    store: memoryStore(),
    env: { OWNER_PIN: "4821", SESSION_SECRET: "a-long-random-test-secret-123456" },
    initial: () => sampleShop(shopNow(at)),
    clock: () => at,
  };
}

const call = (deps: Deps, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(
    new Request(`https://shop.test${path}`, {
      method,
      headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );

const request = { serviceId: "cut", staffChoice: "youssef", date: "2026-11-02", start: 16 * 60, name: "Sara Test", phone: "06 12 34 56 78" };

async function signIn(deps: Deps) {
  const res = await call(deps, "POST", "/api/owner/login", { pin: "4821" });
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

test("customers see when barbers are busy, never who booked", async () => {
  const deps = setup();
  const res = await call(deps, "GET", "/api/shop");
  const { shop } = (await res.json()) as { shop: Shop };
  assert.ok(shop.bookings.length > 0);
  for (const b of shop.bookings) {
    assert.equal(b.customer.phone, "");
    assert.equal(b.customer.name, "");
    assert.equal(b.code, "");
  }
  assert.ok(shop.blocks.every((b) => b.reason === ""));
});

test("a customer books, finds, moves and cancels through the API", async () => {
  const deps = setup();
  const made = await call(deps, "POST", "/api/bookings", { request });
  assert.equal(made.status, 201);
  const { booking } = (await made.json()) as { booking: { code: string; start: number } };
  // The same time can't be taken twice.
  const again = await call(deps, "POST", "/api/bookings", { request });
  assert.deepEqual([again.status, await again.json()], [400, { error: "slot-taken" }]);

  const found = await call(deps, "POST", "/api/bookings/find", { code: booking.code, phone: "+212612345678" });
  assert.equal(found.status, 200);
  const wrong = await call(deps, "POST", "/api/bookings/find", { code: booking.code, phone: "0699999999" });
  assert.equal(wrong.status, 400);

  const moved = await call(deps, "POST", "/api/bookings/move", { code: booking.code, phone: "0612345678", move: { date: "2026-11-02", start: 18 * 60, staffChoice: "any" } });
  assert.equal(((await moved.json()) as { booking: { start: number } }).booking.start, 18 * 60);
  const cancelled = await call(deps, "POST", "/api/bookings/cancel", { code: booking.code, phone: "0612345678" });
  assert.equal(((await cancelled.json()) as { booking: { status: string } }).booking.status, "cancelled");
});

test("owner routes need the PIN, and wrong PINs are limited", async () => {
  const deps = setup();
  assert.equal((await call(deps, "GET", "/api/owner/shop")).status, 401);
  assert.equal((await call(deps, "POST", "/api/owner/login", { pin: "0000" })).status, 401);
  const cookie = await signIn(deps);
  const res = await call(deps, "GET", "/api/owner/shop", undefined, { cookie });
  const { shop } = (await res.json()) as { shop: Shop };
  assert.ok(shop.bookings.some((b) => b.customer.phone)); // the owner sees phone numbers
  // A forged or expired cookie doesn't work.
  const [name, value] = cookie.split("=");
  const forged = `${name}=${Number(value.split(".")[0]) + 1}.${value.split(".")[1]}`;
  assert.equal((await call(deps, "GET", "/api/owner/shop", undefined, { cookie: forged })).status, 401);
  // Five tries per 15 minutes: the sixth is refused even with the right PIN.
  for (let i = 0; i < 3; i++) await call(deps, "POST", "/api/owner/login", { pin: "1111" });
  assert.equal((await call(deps, "POST", "/api/owner/login", { pin: "4821" })).status, 429);
});

test("owner changes go through the same rules, and undo keeps others' bookings", async () => {
  const deps = setup();
  const cookie = await signIn(deps);
  const op = (o: unknown) => call(deps, "POST", "/api/owner/op", { op: o }, { cookie });

  const added = await op({ type: "book", request: { ...request, phone: "", name: "Walk In" } });
  const { shop: after, booking } = (await added.json()) as { shop: Shop; booking: { id: string } };
  const before = (await (await call(deps, "GET", "/api/owner/shop", undefined, { cookie })).json()) as { shop: Shop };
  assert.equal((await op({ type: "block", block: { staffId: "youssef", date: "2026-11-02", start: 16 * 60, end: 17 * 60, reason: "" } })).status, 400);

  // A customer books meanwhile; undoing the walk-in must not lose it.
  await call(deps, "POST", "/api/bookings", { request: { ...request, start: 18 * 60 } });
  const prior = { ...after, bookings: after.bookings.filter((b) => b.id !== booking.id) };
  const undo = changeOf(prior, before.shop);
  const res = await op({ type: "revert", before: undo.before, after: undo.after });
  const { shop } = (await res.json()) as { shop: Shop };
  assert.ok(!shop.bookings.some((b) => b.id === booking.id));
  assert.ok(shop.bookings.some((b) => b.start === 18 * 60 && b.customer.name === "Sara Test"));

  const reminded = await op({ type: "reminded", id: shop.bookings[0].id });
  assert.ok(((await reminded.json()) as { shop: Shop }).shop.bookings[0].remindedAt);
});

test("bookings from one address are limited, and bad input is refused", async () => {
  const deps = setup();
  const headers = { "cf-connecting-ip": "203.0.113.9" };
  let last = 0;
  for (let i = 0; i < 11; i++) {
    last = (await call(deps, "POST", "/api/bookings", { request: { ...request, start: (10 + i) * 60 } }, headers)).status;
  }
  assert.equal(last, 429);
  assert.equal((await call(deps, "POST", "/api/bookings", "nonsense")).status, 400);
  const plain = await handle(new Request("https://shop.test/api/bookings", { method: "POST", body: "{}" }), deps);
  assert.equal(plain.status, 415);
});

test("without a PIN set up, the owner area stays closed", async () => {
  const deps = { ...setup(), env: { OWNER_PIN: "", SESSION_SECRET: "" } };
  assert.equal((await call(deps, "POST", "/api/owner/login", { pin: "" })).status, 503);
});

test("a save that loses a race is done again on the newer shop", async () => {
  const deps = setup();
  await call(deps, "GET", "/api/shop");
  const store = deps.store;
  const write = store.write.bind(store);
  let first = true;
  // Someone else saves between our read and our write, once.
  store.write = async (version, shop) => {
    if (first && version !== null) {
      first = false;
      const current = (await store.read())!;
      await write(current.version, { ...current.shop, blocks: [...current.shop.blocks, { id: "x", staffId: "hamza", date: "2026-11-02", start: 20 * 60, end: 21 * 60, reason: "" }] });
    }
    return write(version, shop);
  };
  const res = await call(deps, "POST", "/api/bookings", { request });
  assert.equal(res.status, 201);
  const saved = (await store.read())!.shop;
  assert.ok(saved.blocks.some((b) => b.id === "x")); // their change survived
  assert.ok(saved.bookings.some((b) => b.customer.name === "Sara Test")); // and ours landed
});
