import { sampleShop } from "../src/lib/sample.ts";
import { shopNow } from "../src/lib/schedule.ts";
import type { Shop } from "../src/lib/types.ts";

/**
 * The shop a new deployment starts with. Set this up for each client: name,
 * address, WhatsApp number, opening hours, services and team. The owner can
 * then change prices, durations and hours from the dashboard.
 *
 * It starts from the demo barbershop with no bookings.
 */
export function initialShop(): Shop {
  return { ...sampleShop(shopNow()), bookings: [], blocks: [] };
}
