import type { Copy } from "../lib/copy.ts";
import { dayLong, minutes, price } from "../lib/format.ts";
import { clock } from "../lib/schedule.ts";
import type { Booking, Lang, Shop } from "../lib/types.ts";
import { Pressed } from "../ui.tsx";

/** The appointment card a barber hands you, built as stationery: the product's one object. */
export function AppointmentCard({
  shop,
  booking,
  t,
  lang,
  stamp,
}: {
  shop: Shop;
  booking: Booking;
  t: Copy;
  lang: Lang;
  stamp: string;
}) {
  const service = shop.services.find((s) => s.id === booking.serviceId)!;
  const staff = shop.staff.find((s) => s.id === booking.staffId)!;
  return (
    <article className="appointment stock" aria-label={`${stamp}: ${service.name[lang]}`}>
      <header className="appointment-head">
        <span className="appointment-shop">{shop.business.name}</span>
        <span className="appointment-city">{shop.business.city}</span>
      </header>
      <p className="appointment-day">{dayLong(t, booking.date)}</p>
      <p className="appointment-time fig">
        {clock(booking.start)}
        <span className="appointment-end"> – {clock(booking.end)}</span>
      </p>
      <dl className="appointment-lines">
        <div>
          <dt>{t.service}</dt>
          <dd>{service.name[lang]}</dd>
        </div>
        <div>
          <dt>{t.barber}</dt>
          <dd>{staff.name}</dd>
        </div>
        <div>
          <dt>{t.price}</dt>
          <dd>
            {price(t, service.price)}, {minutes(t, service.minutes)}
          </dd>
        </div>
        <div>
          <dt>{t.bookingCode}</dt>
          <dd className="fig appointment-code">{booking.code}</dd>
        </div>
      </dl>
      <Pressed>{stamp}</Pressed>
    </article>
  );
}
