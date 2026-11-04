import type { Copy } from "../lib/copy.ts";
import { clock, shopNow, weekday } from "../lib/schedule.ts";
import type { Shop } from "../lib/types.ts";

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/**
 * Where the shop is and when it's open: what people coming from Instagram look
 * for first. Compact is the line under the title; full is the section at the end.
 */
export function ShopInfo({ shop, t, compact = false }: { shop: Shop; t: Copy; compact?: boolean }) {
  const { name, address, whatsapp, hours } = shop.business;
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
  const links = (
    <div className="shop-links">
      <a href={map} target="_blank" rel="noopener noreferrer">
        {t.openMap}
      </a>
      <a href={`tel:+${whatsapp}`}>{t.callShop}</a>
      <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
        {t.whatsappShop}
      </a>
    </div>
  );
  if (compact)
    return (
      <div className="shop-where">
        <p className="shop-address">{address}</p>
        {links}
      </div>
    );

  const today = weekday(shopNow().date);
  return (
    <section className="visit" aria-labelledby="visit-title">
      <h2 id="visit-title">{t.findUs}</h2>
      <div className="visit-grid">
        <div>
          <h3>{t.address}</h3>
          <p>{address}</p>
          {links}
        </div>
        <div>
          <h3>{t.hours}</h3>
          <dl className="visit-hours">
            {MONDAY_FIRST.map((d) => {
              const open = hours[d];
              return (
                <div key={d} aria-current={d === today ? "date" : undefined}>
                  <dt>{t.weekdays[d]}</dt>
                  <dd className="fig">{open ? `${clock(open[0])} – ${clock(open[1])}` : t.closedDay}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
