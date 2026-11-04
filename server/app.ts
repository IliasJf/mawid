import { publicShop, runOwnerOp, type OwnerOp } from "../src/lib/ops.ts";
import {
  BookingError,
  book,
  cancelByCustomer,
  findBooking,
  moveByCustomer,
  shopNow,
  type BookingRequest,
  type Move,
} from "../src/lib/schedule.ts";
import type { Booking, Now, Shop } from "../src/lib/types.ts";

/** Where the shop lives. D1 in production, memory in tests. */
export interface Store {
  read(): Promise<{ version: number; shop: Shop } | null>;
  /** Saves only if nobody saved since `version` was read (null: first save). */
  write(version: number | null, shop: Shop): Promise<boolean>;
  /** Counts this hit plus earlier ones under `key` in the last `seconds`. */
  hit(key: string, seconds: number): Promise<number>;
}

export interface Env {
  /** The owner's PIN, set as a secret. */
  OWNER_PIN: string;
  /** Signs the owner's session cookie, set as a secret. */
  SESSION_SECRET: string;
}

export interface Deps {
  store: Store;
  env: Env;
  /** The shop as configured for this client, used the first time. */
  initial: () => Shop;
  clock?: () => Date;
}

const SESSION_DAYS = 30;
const COOKIE = "mawid_owner";
// Per visitor address: enough for a family booking together, not for a script.
const LIMITS = {
  book: { max: 10, seconds: 3600 },
  lookup: { max: 30, seconds: 3600 },
  login: { max: 5, seconds: 900 },
};

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// ---------- owner session: a signed expiry, no table to keep ----------

const encoder = new TextEncoder();
const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Compares two strings in time that doesn't depend on where they differ. */
async function sameSecret(secret: string, a: string, b: string) {
  const [x, y] = await Promise.all([sign(secret, a), sign(secret, b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function sessionToken(env: Env, at: Date) {
  const expires = Math.floor(at.getTime() / 1000) + SESSION_DAYS * 86400;
  return `${expires}.${await sign(env.SESSION_SECRET, `owner:${expires}`)}`;
}

async function isOwner(req: Request, env: Env, at: Date) {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return false;
  const [expires, mac] = token.split(".");
  if (!mac || !(Number(expires) > at.getTime() / 1000)) return false;
  return sameSecret(env.SESSION_SECRET, mac, await sign(env.SESSION_SECRET, `owner:${expires}`));
}

// ---------- the shop, read and changed safely ----------

async function load(deps: Deps) {
  const saved = await deps.store.read();
  if (saved) return saved;
  const shop = deps.initial();
  if (await deps.store.write(null, shop)) return { version: 1, shop };
  const again = await deps.store.read();
  if (!again) throw new HttpError(503, "busy");
  return again;
}

/** Reads, applies the change, and saves; if someone saved in between, does it again on their version. */
async function change<T>(deps: Deps, fn: (shop: Shop) => { shop: Shop } & T): Promise<{ shop: Shop } & T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { version, shop } = await load(deps);
    const result = fn(shop);
    if (result.shop === shop || (await deps.store.write(version, result.shop))) return result;
  }
  throw new HttpError(503, "busy");
}

async function limit(deps: Deps, req: Request, name: keyof typeof LIMITS) {
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  const { max, seconds } = LIMITS[name];
  if ((await deps.store.hit(`${name}:${ip}`, seconds)) > max) throw new HttpError(429, "limit");
}

async function body(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new HttpError(415, "bad-request");
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, "bad-request");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object") return value;
  } catch {}
  throw new HttpError(400, "bad-request");
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** What a customer gets back about their own booking. */
const ownView = (b: Booking) => ({ ...b, remindedAt: undefined });

// ---------- routes ----------

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const at = deps.clock?.() ?? new Date();
  const now: Now = shopNow(at);
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (req.method === "GET" && path === "/api/shop") {
      return json({ shop: publicShop((await load(deps)).shop, now) });
    }

    if (req.method === "POST" && path === "/api/bookings") {
      await limit(deps, req, "book");
      const request = (await body(req)).request as BookingRequest;
      if (!request || typeof request !== "object") throw new HttpError(400, "bad-request");
      const { booking } = await change(deps, (shop) =>
        book(
          shop,
          {
            serviceId: str(request.serviceId),
            staffChoice: str(request.staffChoice),
            date: str(request.date),
            start: Number(request.start),
            name: str(request.name),
            phone: str(request.phone),
            note: str(request.note),
            by: "customer",
          },
          now,
        ),
      );
      return json({ booking: ownView(booking) }, 201);
    }

    if (req.method === "POST" && path.startsWith("/api/bookings/")) {
      await limit(deps, req, "lookup");
      const input = await body(req);
      const code = str(input.code),
        phone = str(input.phone);
      const action = path.slice("/api/bookings/".length);
      if (action === "find") {
        const booking = findBooking((await load(deps)).shop, code, phone);
        if (!booking) throw new BookingError("not-found");
        return json({ booking: ownView(booking) });
      }
      if (action === "move") {
        const move = input.move as Move;
        const { booking } = await change(deps, (shop) =>
          moveByCustomer(shop, code, phone, { date: str(move?.date), start: Number(move?.start), staffChoice: str(move?.staffChoice) || "any" }, now),
        );
        return json({ booking: ownView(booking) });
      }
      if (action === "cancel") {
        const { shop } = await change(deps, (shop) => ({ shop: cancelByCustomer(shop, code, phone, now) }));
        return json({ booking: ownView(findBooking(shop, code, phone)!) });
      }
    }

    if (path.startsWith("/api/owner/") && (!deps.env.OWNER_PIN || (deps.env.SESSION_SECRET ?? "").length < 16))
      // Not set up yet: no PIN, or a signing secret too short to trust.
      throw new HttpError(503, "setup");

    if (req.method === "POST" && path === "/api/owner/login") {
      await limit(deps, req, "login");
      const pin = str((await body(req)).pin);
      if (!(await sameSecret(deps.env.SESSION_SECRET, pin, deps.env.OWNER_PIN))) throw new HttpError(401, "pin");
      const cookie = `${COOKIE}=${await sessionToken(deps.env, at)}; Path=/api/owner; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
      return json({ ok: true }, 200, { "set-cookie": cookie });
    }
    if (req.method === "POST" && path === "/api/owner/logout") {
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/api/owner; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }

    if (path.startsWith("/api/owner/")) {
      if (!(await isOwner(req, deps.env, at))) throw new HttpError(401, "auth");
      if (req.method === "GET" && path === "/api/owner/shop") return json({ shop: (await load(deps)).shop });
      if (req.method === "POST" && path === "/api/owner/op") {
        const op = (await body(req)).op as OwnerOp;
        if (!op || typeof op !== "object" || typeof op.type !== "string") throw new HttpError(400, "bad-request");
        const result = await change(deps, (shop) => runOwnerOp(shop, op, now));
        return json(result);
      }
    }

    throw new HttpError(404, "not-found");
  } catch (cause) {
    if (cause instanceof BookingError) return json({ error: cause.code }, 400);
    if (cause instanceof HttpError) return json({ error: cause.code }, cause.status);
    console.error(cause);
    return json({ error: "server" }, 500);
  }
}
