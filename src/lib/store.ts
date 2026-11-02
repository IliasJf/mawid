import { useSyncExternalStore } from "react";
import { sampleShop } from "./sample.ts";
import { shopNow } from "./schedule.ts";
import type { Shop } from "./types.ts";

// The demo keeps the whole shop in this browser. A real deployment swaps this
// module for an API with the same three calls: read, write, subscribe.
const KEY = "mawid:shop:v1";
const listeners = new Set<() => void>();
let current: Shop | null = null;

function load(): Shop {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const shop = JSON.parse(saved) as Shop;
      if (shop.version === 1) return shop;
    }
  } catch {}
  return sampleShop(shopNow());
}

export function getShop(): Shop {
  return (current ??= load());
}

export function saveShop(next: Shop) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function resetShop() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  current = null;
  listeners.forEach((l) => l());
}

// Another tab (the owner's agenda, say) sees a booking as soon as it is made.
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      current = null;
      listeners.forEach((l) => l());
    }
  });

export function useShop(): Shop {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getShop,
    getShop,
  );
}
