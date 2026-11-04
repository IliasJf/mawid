import type { Copy } from "./copy.ts";
import { COPY } from "./copy.ts";
import { runOwnerOp, type OwnerOp } from "./ops.ts";
import {
  BookingError,
  book,
  cancelByCustomer,
  findBooking,
  moveByCustomer,
  shopNow,
  type BookingErrorCode,
  type BookingRequest,
  type Move,
} from "./schedule.ts";
import { REMOTE, getShop, markSignedOut, refresh, saveShop } from "./store.ts";
import type { Booking, Shop } from "./types.ts";

/**
 * Every change the pages make goes through here. In the demo it runs the rules
 * on this browser's copy; on a server it asks the server, which runs the same
 * rules on the shared copy.
 */

export type Problem = "limit" | "network" | "server" | "pin" | "setup";
export class BackendError extends Error {
  code: Problem;
  constructor(code: Problem) {
    super(code);
    this.code = code;
  }
}

const BOOKING_CODES = new Set(Object.keys(COPY.en.errors));

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BackendError("network");
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data as T;
  const code = (data as { error?: string }).error ?? "";
  if (BOOKING_CODES.has(code)) throw new BookingError(code as BookingErrorCode);
  if (code === "auth") {
    markSignedOut();
    throw new BackendError("pin");
  }
  if (code === "pin" || code === "limit" || code === "setup") throw new BackendError(code);
  throw new BackendError("server");
}

/** The words for whatever went wrong, in the reader's language. */
export function problemText(t: Copy, cause: unknown): string {
  if (cause instanceof BookingError) return t.errors[cause.code];
  if (cause instanceof BackendError) return t.problems[cause.code];
  throw cause;
}

// ---------- customers ----------

export async function bookVisit(request: Omit<BookingRequest, "by">): Promise<Booking> {
  if (!REMOTE) {
    const result = book(getShop(), { ...request, by: "customer" }, shopNow());
    saveShop(result.shop);
    return result.booking;
  }
  const { booking } = await post<{ booking: Booking }>("/api/bookings", { request });
  void refresh("public");
  return booking;
}

export async function findVisit(code: string, phone: string): Promise<Booking> {
  if (!REMOTE) {
    const booking = findBooking(getShop(), code, phone);
    if (!booking) throw new BookingError("not-found");
    return booking;
  }
  return (await post<{ booking: Booking }>("/api/bookings/find", { code, phone })).booking;
}

export async function moveVisit(code: string, phone: string, move: Move): Promise<Booking> {
  if (!REMOTE) {
    const result = moveByCustomer(getShop(), code, phone, move, shopNow());
    saveShop(result.shop);
    return result.booking;
  }
  const { booking } = await post<{ booking: Booking }>("/api/bookings/move", { code, phone, move });
  void refresh("public");
  return booking;
}

export async function cancelVisit(code: string, phone: string): Promise<Booking> {
  if (!REMOTE) {
    const shop = cancelByCustomer(getShop(), code, phone, shopNow());
    saveShop(shop);
    return findBooking(shop, code, phone)!;
  }
  const { booking } = await post<{ booking: Booking }>("/api/bookings/cancel", { code, phone });
  void refresh("public");
  return booking;
}

// ---------- owner ----------

export interface OpResult {
  shop: Shop;
  booking?: Booking;
  undo: { before: Shop; after: Shop };
}

export async function ownerOp(op: OwnerOp): Promise<OpResult> {
  if (!REMOTE) {
    const result = runOwnerOp(getShop(), op, shopNow());
    saveShop(result.shop);
    return result;
  }
  const result = await post<OpResult>("/api/owner/op", { op });
  saveShop(result.shop);
  return result;
}

export async function signIn(pin: string) {
  await post("/api/owner/login", { pin });
  await refresh("owner");
}

export async function signOut() {
  await post("/api/owner/logout", {}).catch(() => {});
  markSignedOut();
}
