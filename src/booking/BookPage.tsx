import { useEffect, useMemo, useRef, useState } from "react";
import type { PageProps } from "../App.tsx";
import { calendarFile, dayLong, dayNumber, dayShort, minutes, price, whatsappUrl } from "../lib/format.ts";
import {
  BookingError,
  availableSlots,
  bookableDates,
  book,
  clock,
  firstOpenDate,
  normalizePhone,
  shopNow,
  staffFor,
} from "../lib/schedule.ts";
import { getShop, saveShop, useShop } from "../lib/store.ts";
import type { Booking } from "../lib/types.ts";
import { Field, LanguagePicker } from "../ui.tsx";
import { AppointmentCard } from "./AppointmentCard.tsx";

const CUSTOMER_KEY = "mawid:customer";
function rememberedCustomer() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "{}");
    return { name: String(saved.name || ""), phone: String(saved.phone || "") };
  } catch {
    return { name: "", phone: "" };
  }
}

/** Keeps "now" fresh, so slots inside the lead time drop off while the page is open. */
function useShopNow() {
  const [now, setNow] = useState(shopNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(shopNow()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function BookPage({ t, lang, setLang }: PageProps) {
  const shop = useShop();
  const now = useShopNow();
  const services = shop.services.filter((s) => s.active);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffChoice, setStaffChoice] = useState("any");
  const [date, setDate] = useState(() => firstOpenDate(shop, services[0]?.id ?? "", "any", now) ?? now.date);
  const [start, setStart] = useState<number | null>(null);
  const [customer, setCustomer] = useState(rememberedCustomer);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [done, setDone] = useState<Booking | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const service = shop.services.find((s) => s.id === serviceId);
  const people = staffFor(shop, serviceId);
  const dates = bookableDates(shop, now);
  const slotsByDate = useMemo(
    () => new Map(dates.map((d) => [d, availableSlots(shop, serviceId, staffChoice, d, now)])),
    [shop, serviceId, staffChoice, now, dates.join()],
  );
  const slots = slotsByDate.get(date) ?? [];
  const nextDay = slots.length ? undefined : dates.find((d) => d > date && (slotsByDate.get(d)?.length ?? 0) > 0);
  const chosenSlot = slots.find((s) => s.start === start);

  // A choice that no longer fits (a service the barber doesn't do, a time just taken) is cleared.
  useEffect(() => {
    if (staffChoice !== "any" && !people.some((p) => p.id === staffChoice)) setStaffChoice("any");
  }, [serviceId]);
  useEffect(() => {
    if (start !== null && !chosenSlot) setStart(null);
  }, [chosenSlot, start]);
  useEffect(() => {
    if (done) cardRef.current?.focus();
  }, [done]);

  const groups = [
    { label: t.morning, items: slots.filter((s) => s.start < 12 * 60) },
    { label: t.afternoon, items: slots.filter((s) => s.start >= 12 * 60 && s.start < 17 * 60) },
    { label: t.evening, items: slots.filter((s) => s.start >= 17 * 60) },
  ].filter((g) => g.items.length);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Every field problem at once, beside its field, before asking the engine.
    const fieldErrors = {
      name: customer.name.trim().length < 2 ? t.errors.name : undefined,
      phone: normalizePhone(customer.phone) ? undefined : t.errors.phone,
      form: start === null || !service ? t.chooseFirst : undefined,
    };
    if (fieldErrors.name || fieldErrors.phone || fieldErrors.form) {
      setErrors(fieldErrors);
      document.getElementById(fieldErrors.form ? "summary-title" : fieldErrors.name ? "name" : "phone")?.focus();
      return;
    }
    if (start === null) return;
    try {
      const result = book(getShop(), { serviceId, staffChoice, date, start, name: customer.name, phone: customer.phone, note }, shopNow());
      saveShop(result.shop);
      try {
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
      } catch {}
      setErrors({});
      setNote("");
      setDone(result.booking);
      scrollTo({ top: 0 });
    } catch (cause) {
      if (!(cause instanceof BookingError)) throw cause;
      const message = t.errors[cause.code];
      if (cause.code === "name") setErrors({ name: message });
      else if (cause.code === "phone") setErrors({ phone: message });
      else {
        setErrors({ form: message });
        if (cause.code === "slot-taken") setStart(null);
      }
    }
  }

  const header = (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="wordmark">{shop.business.name}</span>
        <nav className="topbar-actions" aria-label={t.bookTitle}>
          <a href="#/manage">{t.manageLink}</a>
          <LanguagePicker t={t} lang={lang} setLang={setLang} />
        </nav>
      </div>
    </header>
  );

  if (done) {
    const staff = shop.staff.find((s) => s.id === done.staffId)!;
    const doneService = shop.services.find((s) => s.id === done.serviceId)!;
    const message = t.waMessage({
      name: done.customer.name,
      service: doneService.name[lang],
      day: dayLong(t, done.date),
      time: clock(done.start),
      staff: staff.name,
      code: done.code,
    });
    const ics = URL.createObjectURL(
      new Blob([calendarFile(done, shop.business, doneService, staff, doneService.name[lang])], { type: "text/calendar" }),
    );
    return (
      <div className="page page-book">
        {header}
        <main className="container booked" id="main">
          <div className="booked-card" ref={cardRef} tabIndex={-1}>
            <h1 className="booked-title">{t.bookedLead(done.customer.name.split(" ")[0])}</h1>
            <div className="desk">
              <AppointmentCard shop={shop} booking={done} t={t} lang={lang} stamp={t.booked} />
            </div>
            <p className="booked-keep">{t.keepCode}</p>
            <div className="booked-actions">
              <a className="btn btn--ink" href={whatsappUrl(shop.business.whatsapp, message)} target="_blank" rel="noopener noreferrer">
                {t.sendWhatsApp}
              </a>
              <a className="btn btn--card" href={ics} download={`mawid-${done.code}.ics`}>
                {t.addCalendar}
              </a>
              <button className="btn btn--quiet" type="button" onClick={() => setDone(null)}>
                {t.bookAnother}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page page-book">
      {header}
      <main className="container" id="main">
        <div className="shop-intro">
          <h1>{t.bookTitle}</h1>
          <p className="lead">{shop.business.tagline[lang]}</p>
          <p className="shop-address">{shop.business.address}</p>
        </div>
        <form className="book-layout" onSubmit={submit} noValidate>
          <div className="book-steps">
            <fieldset className="step">
              <legend>
                <span className="step-n fig">1</span> {t.stepService}
              </legend>
              <div className="choice-list">
                {services.map((s) => (
                  <label key={s.id} className="choice choice--service">
                    <input
                      type="radio"
                      name="service"
                      value={s.id}
                      checked={serviceId === s.id}
                      onChange={() => {
                        setServiceId(s.id);
                        setStart(null);
                        setErrors({});
                      }}
                    />
                    <span className="choice-body">
                      <span className="choice-title">{s.name[lang]}</span>
                      <span className="choice-meta">{minutes(t, s.minutes)}</span>
                    </span>
                    <span className="choice-price">{price(t, s.price)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="step">
              <legend>
                <span className="step-n fig">2</span> {t.stepStaff}
              </legend>
              <div className="choice-row">
                {[{ id: "any", name: t.anyone }, ...people].map((p) => (
                  <label key={p.id} className="choice choice--staff">
                    <input
                      type="radio"
                      name="staff"
                      value={p.id}
                      checked={staffChoice === p.id}
                      onChange={() => {
                        setStaffChoice(p.id);
                        setStart(null);
                      }}
                    />
                    <span className="choice-avatar" aria-hidden="true">
                      {p.id === "any" ? "∗" : p.name.slice(0, 1)}
                    </span>
                    <span className="choice-title">{p.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="step">
              <legend>
                <span className="step-n fig">3</span> {t.stepTime}
              </legend>
              <div className="day-strip" role="radiogroup" aria-label={t.stepTime}>
                {dates.map((d) => {
                  const open = (slotsByDate.get(d)?.length ?? 0) > 0;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={d === date}
                      aria-label={`${dayLong(t, d)}${open ? "" : `, ${t.closed}`}`}
                      className="day"
                      data-open={open || undefined}
                      onClick={() => {
                        setDate(d);
                        setStart(null);
                      }}
                    >
                      <span className="day-name">{d === now.date ? t.today : dayShort(t, d)}</span>
                      <span className="day-num fig">{dayNumber(t, d)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="day-label">{dayLong(t, date)}</p>
              {groups.length ? (
                groups.map((g) => (
                  <div className="slot-group" key={g.label}>
                    <p className="slot-group-label">{g.label}</p>
                    <div className="slots">
                      {g.items.map((s) => (
                        <label key={s.start} className="slot">
                          <input
                            type="radio"
                            name="slot"
                            value={s.start}
                            checked={start === s.start}
                            onChange={() => {
                              setStart(s.start);
                              setErrors((e) => ({ ...e, form: undefined }));
                            }}
                          />
                          <span className="fig">{clock(s.start)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-slots">
                  <p>{t.noSlots}</p>
                  {nextDay && (
                    <button type="button" className="link-button" onClick={() => setDate(nextDay)}>
                      {t.nextFree(dayLong(t, nextDay))} {t.showDay}
                    </button>
                  )}
                </div>
              )}
            </fieldset>

            <fieldset className="step">
              <legend>
                <span className="step-n fig">4</span> {t.stepDetails}
              </legend>
              <Field label={t.name} id="name" error={errors.name}>
                <input
                  id="name"
                  autoComplete="name"
                  maxLength={60}
                  value={customer.name}
                  aria-invalid={!!errors.name || undefined}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  onChange={(e) => {
                    setCustomer((c) => ({ ...c, name: e.target.value }));
                    if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                  }}
                />
              </Field>
              <Field label={t.phone} id="phone" hint={t.phoneHint} error={errors.phone}>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="06 12 34 56 78"
                  value={customer.phone}
                  aria-invalid={!!errors.phone || undefined}
                  aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                  onChange={(e) => {
                    setCustomer((c) => ({ ...c, phone: e.target.value }));
                    if (errors.phone) setErrors((x) => ({ ...x, phone: undefined }));
                  }}
                />
              </Field>
              <Field label={t.note} id="note" optional={t.optional}>
                <textarea id="note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </fieldset>
          </div>

          <aside className="summary stock" aria-labelledby="summary-title">
            <h2 id="summary-title" tabIndex={-1}>{t.summary}</h2>
            {service && (
              <dl className="summary-lines">
                <div>
                  <dt>{t.service}</dt>
                  <dd>{service.name[lang]}</dd>
                </div>
                <div>
                  <dt>{t.when}</dt>
                  <dd>
                    {dayLong(t, date)}
                    {start !== null && (
                      <>
                        , <span className="fig">{clock(start)}</span>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t.barber}</dt>
                  <dd>
                    {chosenSlot ? shop.staff.find((s) => s.id === chosenSlot.staffIds[0])?.name : staffChoice === "any" ? t.anyoneHint : shop.staff.find((s) => s.id === staffChoice)?.name}
                  </dd>
                </div>
                <div className="summary-total">
                  <dt>{t.price}</dt>
                  <dd>{price(t, service.price)}</dd>
                </div>
              </dl>
            )}
            {errors.form && (
              <p className="form-error" role="alert">
                {errors.form}
              </p>
            )}
            <button className="btn btn--ink btn--block" type="submit">
              {t.confirm}
            </button>
          </aside>
        </form>
        <footer className="page-foot">
          <a href="#/owner">{t.ownerLink}</a>
          <span>{t.demoNote}</span>
        </footer>
      </main>
    </div>
  );
}
