import { useEffect, useSyncExternalStore } from "react";
import { sampleShop } from "./sample.ts";
import { shopNow } from "./schedule.ts";
import type { Shop } from "./types.ts";

/**
 * Two ways to run. The demo keeps the whole shop in this browser. A real
 * deployment (built with `--mode server`) reads it from the shop's server:
 * customers get the public view, the owner the full one after the PIN.
 */
export const REMOTE = import.meta.env.VITE_BACKEND === "api";

export type Scope = "public" | "owner";
export type Status = "loading" | "ready" | "error" | "signed-out" | "setup";
interface Snapshot {
  status: Status;
  scope: Scope | null;
  shop: Shop | null;
}

const KEY = "mawid:shop:v1";
const REFRESH_MS = 20_000;
const listeners = new Set<() => void>();
let snap: Snapshot = { status: REMOTE ? "loading" : "ready", scope: null, shop: null };
let pending: Promise<void> | null = null;

const emit = (next: Partial<Snapshot>) => {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
};

function loadLocal(): Shop {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const shop = JSON.parse(saved) as Shop;
      if (shop.version === 1) return shop;
    }
  } catch {}
  return sampleShop(shopNow());
}

/** The shop as this page last saw it. Pages only render once it's there. */
export function getShop(): Shop {
  if (!REMOTE) return (snap.shop ??= loadLocal());
  if (!snap.shop) throw new Error("The shop isn't loaded yet.");
  return snap.shop;
}

export function saveShop(next: Shop) {
  if (!REMOTE)
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  emit({ shop: next });
}

export function resetShop() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit({ shop: null });
}

/** Fetches the shop for this scope again. Quiet: a failed refresh keeps what's on screen. */
export function refresh(scope: Scope = snap.scope ?? "public"): Promise<void> {
  if (!REMOTE) return Promise.resolve();
  if (pending && snap.scope === scope) return pending;
  if (snap.scope !== scope) emit({ scope, status: "loading", shop: null });
  pending = fetch(scope === "owner" ? "/api/owner/shop" : "/api/shop", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      if (snap.scope !== scope) return;
      if (res.ok) emit({ status: "ready", shop: ((await res.json()) as { shop: Shop }).shop });
      else if (res.status === 401) emit({ status: "signed-out", shop: null });
      else if (res.status === 503 && (await res.json().catch(() => ({}))).error === "setup") emit({ status: "setup", shop: null });
      else if (snap.status !== "ready") emit({ status: "error" });
    })
    .catch(() => {
      if (snap.scope === scope && snap.status !== "ready") emit({ status: "error" });
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export const markSignedOut = () => emit({ status: "signed-out", shop: null });

// Another tab (the owner's agenda, say) sees a demo booking as soon as it is made.
if (typeof window !== "undefined" && !REMOTE)
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) emit({ shop: null });
  });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const read = () => {
  if (!REMOTE && !snap.shop) snap = { ...snap, shop: loadLocal() };
  return snap;
};

/** The shop and whether it's ready, for this scope. On a server, it stays fresh while the page is open. */
export function useStore(scope: Scope): Snapshot {
  const current = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (!REMOTE) return;
    void refresh(scope);
    const again = () => {
      if (document.visibilityState === "visible") void refresh(scope);
    };
    const timer = setInterval(again, REFRESH_MS);
    addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearInterval(timer);
      removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [scope]);
  return current;
}

/** For pages under the gate in App, where the shop is known to be there. */
export function useShop(): Shop {
  useSyncExternalStore(subscribe, read, read);
  return getShop();
}
