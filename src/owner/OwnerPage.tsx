import { useEffect, useState } from "react";
import type { PageProps } from "../App.tsx";
import { go } from "../App.tsx";
import type { Copy } from "../lib/copy.ts";
import { dayLong, minutes, price } from "../lib/format.ts";
import {
  BookingError,
  addBlock,
  addDays,
  clock,
  displayPhone,
  isDate,
  parseClock,
  removeBlock,
  setStatus,
  shopNow,
  updateService,
  weekday,
  workWindow,
} from "../lib/schedule.ts";
import { getShop, resetShop, saveShop, useShop } from "../lib/store.ts";
import type { Booking, BookingStatus, DayHours, Lang, Shop } from "../lib/types.ts";
import { Field, LanguagePicker } from "../ui.tsx";

type Tab = "agenda" | "bookings" | "services" | "hours";
const TABS: Tab[] = ["agenda", "bookings", "services", "hours"];

interface Toast {
  message: string;
  undo?: Shop;
}

export function OwnerPage({ t, lang, setLang, route }: PageProps) {
  const shop = useShop();
  const tab: Tab = TABS.includes(route.path[1] as Tab) ? (route.path[1] as Tab) : "agenda";
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Every change goes through here: saved at once, with an undo where it matters. */
  const commit = (next: Shop, message: string, undoable = false) => {
    const before = getShop();
    saveShop(next);
    setToast({ message, undo: undoable ? before : undefined });
  };
  const tabLabel: Record<Tab, string> = {
    agenda: t.agenda,
    bookings: t.bookingsTab,
    services: t.servicesTab,
    hours: t.hoursTab,
  };

  return (
    <div className="page page-owner">
      <header className="topbar topbar--owner">
        <div className="topbar-inner">
          <span className="wordmark">
            {shop.business.name}
            <span className="wordmark-role">{t.ownerTitle}</span>
          </span>
          <nav className="owner-tabs" aria-label={t.ownerTitle}>
            {TABS.map((id) => (
              <a key={id} href={`#/owner/${id}`} aria-current={tab === id ? "page" : undefined}>
                {tabLabel[id]}
              </a>
            ))}
          </nav>
          <div className="topbar-actions">
            <a href="#/">{t.customerPage}</a>
            <LanguagePicker t={t} lang={lang} setLang={setLang} />
          </div>
        </div>
      </header>
      <main className="container owner" id="main">
        {tab === "agenda" && <Agenda shop={shop} t={t} lang={lang} route={route} commit={commit} />}
        {tab === "bookings" && <Bookings shop={shop} t={t} lang={lang} route={route} commit={commit} />}
        {tab === "services" && <Services shop={shop} t={t} lang={lang} commit={commit} />}
        {tab === "hours" && <Hours shop={shop} t={t} commit={commit} />}
        <footer className="page-foot">
          <span>{t.demoNote}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              if (confirm(t.resetConfirm)) resetShop();
            }}
          >
            {t.resetDemo}
          </button>
        </footer>
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  saveShop(toast.undo!);
                  setToast(null);
                }}
              >
                {t.undo}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TabProps {
  shop: Shop;
  t: Copy;
  lang: Lang;
  route: PageProps["route"];
  commit: (next: Shop, message: string, undoable?: boolean) => void;
}

function StatusActions({ booking, t, commit }: { booking: Booking; t: Copy; commit: TabProps["commit"] }) {
  const change = (status: BookingStatus) => commit(setStatus(getShop(), booking.id, status), t.statusChanged, true);
  if (booking.status !== "booked")
    return (
      <div className="status-actions">
        <button type="button" className="btn btn--small btn--card" onClick={() => change("booked")}>
          {t.reopen}
        </button>
      </div>
    );
  return (
    <div className="status-actions">
      <button type="button" className="btn btn--small btn--ink" onClick={() => change("done")}>
        {t.markDone}
      </button>
      <button type="button" className="btn btn--small btn--card" onClick={() => change("no-show")}>
        {t.markNoShow}
      </button>
      <button type="button" className="btn btn--small btn--card" onClick={() => change("cancelled")}>
        {t.cancelBooking}
      </button>
    </div>
  );
}

// ---------- agenda: the day sheet ----------

const PX = 1.8; // pixels per minute on the day sheet: a 30-minute booking shows two lines

function Agenda({ shop, t, lang, route, commit }: TabProps) {
  const now = shopNow();
  const day = isDate(route.query.get("day") ?? "") ? route.query.get("day")! : now.date;
  const setDay = (d: string) => go("owner/agenda", d === now.date ? undefined : { day: d }, true);
  const [selected, setSelected] = useState<string | null>(null);
  const staff = shop.staff.filter((s) => s.active);
  const hours: DayHours = shop.business.hours[weekday(day)];
  const [open, close] = hours ?? [9 * 60, 21 * 60];
  const dayBookings = shop.bookings.filter((b) => b.date === day).sort((a, b) => a.start - b.start);
  const live = dayBookings.filter((b) => b.status === "booked" || b.status === "done");
  const expected = live.reduce((sum, b) => sum + (shop.services.find((s) => s.id === b.serviceId)?.price ?? 0), 0);
  const chosen = dayBookings.find((b) => b.id === selected);
  const serviceName = (b: Booking) => shop.services.find((s) => s.id === b.serviceId)?.name[lang] ?? "";
  const hourMarks: number[] = [];
  for (let m = Math.ceil(open / 60) * 60; m < close; m += 60) hourMarks.push(m);
  const nowLine = day === now.date && now.minutes > open && now.minutes < close;

  return (
    <section aria-labelledby="agenda-title">
      <div className="owner-head">
        <h1 id="agenda-title">{dayLong(t, day)}</h1>
        <div className="day-nav">
          <button type="button" className="btn btn--small btn--card" aria-label={t.prevDay} onClick={() => setDay(addDays(day, -1))}>
            <span aria-hidden="true">{t.dir === "rtl" ? "›" : "‹"}</span>
          </button>
          <button type="button" className="btn btn--small btn--card" disabled={day === now.date} onClick={() => setDay(now.date)}>
            {t.today}
          </button>
          <button type="button" className="btn btn--small btn--card" aria-label={t.nextDay} onClick={() => setDay(addDays(day, 1))}>
            <span aria-hidden="true">{t.dir === "rtl" ? "‹" : "›"}</span>
          </button>
        </div>
      </div>
      <p className="owner-sub">{hours ? t.dayTotal(live.length, price(t, expected)) : t.closed}</p>

      <div className="agenda-layout">
        <div className="sheet stock" style={{ "--cols": staff.length } as React.CSSProperties}>
          <div className="sheet-head">
            <span />
            {staff.map((s) => (
              <span key={s.id} className="sheet-staff">
                {s.name}
                {!workWindow(shop, s, day) && <small>{t.offToday}</small>}
              </span>
            ))}
          </div>
          <div className="sheet-body" style={{ height: (close - open) * PX }}>
            <div className="sheet-hours" aria-hidden="true">
              {hourMarks.map((m) => (
                <span key={m} className="fig" style={{ top: (m - open) * PX }}>
                  {clock(m)}
                </span>
              ))}
            </div>
            {staff.map((s) => {
              const window = workWindow(shop, s, day);
              return (
                <div key={s.id} className="sheet-col" aria-label={s.name} role="list">
                  {hourMarks.map((m) => (
                    <span key={m} className="sheet-rule" style={{ top: (m - open) * PX }} aria-hidden="true" />
                  ))}
                  {window ? (
                    <>
                      {window[0] > open && <span className="sheet-off" style={{ top: 0, height: (window[0] - open) * PX }} aria-hidden="true" />}
                      {window[1] < close && <span className="sheet-off" style={{ top: (window[1] - open) * PX, bottom: 0 }} aria-hidden="true" />}
                    </>
                  ) : (
                    <span className="sheet-off" style={{ top: 0, bottom: 0 }} aria-hidden="true" />
                  )}
                  {shop.blocks
                    .filter((b) => b.staffId === s.id && b.date === day)
                    .map((b) => (
                      <div role="listitem" key={b.id} className="sheet-block" style={{ top: (b.start - open) * PX, height: (b.end - b.start) * PX }}>
                        <span>
                          {t.blocked}
                          {b.reason && `: ${b.reason}`}
                        </span>
                        <button type="button" className="sheet-block-remove" aria-label={`${t.removeBlock} ${clock(b.start)}`} onClick={() => commit(removeBlock(getShop(), b.id), t.saved, true)}>
                          ×
                        </button>
                      </div>
                    ))}
                  {dayBookings
                    .filter((b) => b.staffId === s.id && b.status !== "cancelled")
                    .map((b) => (
                      <button
                        role="listitem"
                        type="button"
                        key={b.id}
                        className="sheet-booking"
                        data-status={b.status}
                        aria-pressed={selected === b.id}
                        style={{ top: (b.start - open) * PX, height: Math.max((b.end - b.start) * PX, 28) }}
                        onClick={() => setSelected(selected === b.id ? null : b.id)}
                      >
                        <span className="fig">{clock(b.start)}</span> <strong>{b.customer.name}</strong>
                        <span className="sheet-booking-service">{serviceName(b)}</span>
                      </button>
                    ))}
                </div>
              );
            })}
            {nowLine && <span className="sheet-now" style={{ top: (now.minutes - open) * PX }} aria-hidden="true" />}
          </div>
          {!live.length && hours && (
            <div className="sheet-empty">
              <p>{t.emptyDay}</p>
              <p className="muted">{t.emptyDayHint}</p>
            </div>
          )}
        </div>

        <div className="agenda-side">
          {chosen ? (
            <div className="detail stock">
              <p className="detail-time fig">
                {clock(chosen.start)} – {clock(chosen.end)}
              </p>
              <h2>{chosen.customer.name}</h2>
              <dl className="detail-lines">
                <div>
                  <dt>{t.service}</dt>
                  <dd>{serviceName(chosen)}</dd>
                </div>
                <div>
                  <dt>{t.barber}</dt>
                  <dd>{shop.staff.find((s) => s.id === chosen.staffId)?.name}</dd>
                </div>
                <div>
                  <dt>{t.phone}</dt>
                  <dd>
                    <a dir="ltr" href={`tel:+${chosen.customer.phone}`}>
                      {displayPhone(chosen.customer.phone)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>{t.code}</dt>
                  <dd className="fig">{chosen.code}</dd>
                </div>
                {chosen.note && (
                  <div>
                    <dt>{t.note}</dt>
                    <dd>{chosen.note}</dd>
                  </div>
                )}
              </dl>
              <p className="status-tag" data-status={chosen.status}>
                {t.status[chosen.status]}
              </p>
              <StatusActions booking={chosen} t={t} commit={commit} />
            </div>
          ) : (
            <BlockForm shop={shop} t={t} day={day} commit={commit} />
          )}
        </div>
      </div>
    </section>
  );
}

function BlockForm({ shop, t, day, commit }: { shop: Shop; t: Copy; day: string; commit: TabProps["commit"] }) {
  const staff = shop.staff.filter((s) => s.active);
  const [form, setForm] = useState({ staffId: staff[0]?.id ?? "", from: "14:00", to: "15:00", reason: "" });
  const [error, setError] = useState("");
  return (
    <form
      className="block-form stock"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          commit(
            addBlock(getShop(), { staffId: form.staffId, date: day, start: parseClock(form.from), end: parseClock(form.to), reason: form.reason }),
            t.saved,
            true,
          );
          setError("");
          setForm((f) => ({ ...f, reason: "" }));
        } catch (cause) {
          if (cause instanceof BookingError) setError(t.errors[cause.code]);
          else throw cause;
        }
      }}
    >
      <h2>{t.blockTitle}</h2>
      <Field label={t.barber} id="block-staff">
        <select id="block-staff" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="field-pair">
        <Field label={t.from} id="block-from">
          <input id="block-from" type="time" step={900} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </Field>
        <Field label={t.to} id="block-to">
          <input id="block-to" type="time" step={900} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </Field>
      </div>
      <Field label={t.reason} id="block-reason" optional={t.optional}>
        <input id="block-reason" maxLength={80} placeholder={t.reasonPlaceholder} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn--card btn--block" type="submit">
        {t.saveBlock}
      </button>
    </form>
  );
}

// ---------- bookings: the ledger ----------

function Bookings({ shop, t, lang, route, commit }: TabProps) {
  const now = shopNow();
  const filter = (["upcoming", "past", "all"] as const).find((f) => f === route.query.get("show")) ?? "upcoming";
  const q = route.query.get("q") ?? "";
  const setQuery = (next: { show?: string; q?: string }) => {
    const params: Record<string, string> = {};
    const show = next.show ?? filter;
    const text = next.q ?? q;
    if (show !== "upcoming") params.show = show;
    if (text) params.q = text;
    go("owner/bookings", params, true);
  };
  const isPast = (b: Booking) => b.date < now.date || (b.date === now.date && b.end <= now.minutes);
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "").replace(/^0/, "");
  const rows = shop.bookings
    .filter((b) => (filter === "all" ? true : filter === "past" ? isPast(b) : !isPast(b)))
    .filter(
      (b) =>
        !needle ||
        b.customer.name.toLowerCase().includes(needle) ||
        b.code.toLowerCase() === needle ||
        (digits.length >= 3 && b.customer.phone.includes(digits)),
    )
    .sort((a, b) => (filter === "past" ? -1 : 1) * (a.date.localeCompare(b.date) || a.start - b.start));

  return (
    <section aria-labelledby="bookings-title">
      <div className="owner-head">
        <h1 id="bookings-title">{t.bookingsTab}</h1>
      </div>
      <div className="ledger-tools">
        <div className="groove" role="radiogroup" aria-label={t.bookingsTab}>
          {(["upcoming", "past", "all"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setQuery({ show: f })}>
              {f === "upcoming" ? t.upcoming : f === "past" ? t.past : t.all}
            </button>
          ))}
        </div>
        <label className="search">
          <span className="visually-hidden">{t.search}</span>
          <input type="search" placeholder={t.search} defaultValue={q} onChange={(e) => setQuery({ q: e.target.value })} />
        </label>
      </div>
      {rows.length ? (
        <div className="table-wrap stock">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">{t.when}</th>
                <th scope="col">{t.customer}</th>
                <th scope="col">{t.service}</th>
                <th scope="col">{t.barber}</th>
                <th scope="col">{t.statusCol}</th>
                <th scope="col">
                  <span className="visually-hidden">{t.reopen}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} data-status={b.status}>
                  <td>
                    <a href={`#/owner/agenda?day=${b.date}`}>{dayLong(t, b.date)}</a>
                    <span className="fig cell-sub">{clock(b.start)}</span>
                  </td>
                  <td>
                    {b.customer.name}
                    <a className="fig cell-sub" dir="ltr" href={`tel:+${b.customer.phone}`}>
                      {displayPhone(b.customer.phone)}
                    </a>
                  </td>
                  <td>{shop.services.find((s) => s.id === b.serviceId)?.name[lang]}</td>
                  <td>{shop.staff.find((s) => s.id === b.staffId)?.name}</td>
                  <td>
                    <span className="status-tag" data-status={b.status}>
                      {t.status[b.status]}
                    </span>
                  </td>
                  <td>
                    <StatusActions booking={b} t={t} commit={commit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-note">{t.noMatches}</p>
      )}
    </section>
  );
}

// ---------- services and hours ----------

const DURATIONS = [10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120];

function Services({ shop, t, lang, commit }: Omit<TabProps, "route">) {
  return (
    <section aria-labelledby="services-title">
      <div className="owner-head">
        <h1 id="services-title">{t.servicesTab}</h1>
      </div>
      <div className="table-wrap stock">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">{t.service}</th>
              <th scope="col">{t.duration}</th>
              <th scope="col">{t.price}</th>
              <th scope="col">{t.active}</th>
            </tr>
          </thead>
          <tbody>
            {shop.services.map((s) => (
              <tr key={s.id} data-status={s.active ? "booked" : "cancelled"}>
                <td>{s.name[lang]}</td>
                <td>
                  <select
                    aria-label={`${t.duration}: ${s.name[lang]}`}
                    value={s.minutes}
                    onChange={(e) => commit(updateService(getShop(), { ...s, minutes: Number(e.target.value) }), t.saved)}
                  >
                    {[...new Set([...DURATIONS, s.minutes])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        {minutes(t, m)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="price-input">
                    <input
                      aria-label={`${t.price}: ${s.name[lang]}`}
                      className="fig"
                      inputMode="numeric"
                      dir="ltr"
                      defaultValue={s.price}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isInteger(value) && value >= 0 && value !== s.price) commit(updateService(getShop(), { ...s, price: value }), t.saved);
                        else e.target.value = String(s.price);
                      }}
                    />
                    <span>{t.dh}</span>
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${t.active}: ${s.name[lang]}`}
                    checked={s.active}
                    onChange={(e) => commit(updateService(getShop(), { ...s, active: e.target.checked }), t.saved, true)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Hours({ shop, t, commit }: { shop: Shop; t: Copy; commit: TabProps["commit"] }) {
  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first, as the week reads in Morocco
  const setDay = (day: number, value: DayHours) => {
    const current = getShop();
    const hours = [...current.business.hours] as Shop["business"]["hours"];
    hours[day] = value;
    commit({ ...current, business: { ...current.business, hours } }, t.saved, true);
  };
  return (
    <section aria-labelledby="hours-title">
      <div className="owner-head">
        <h1 id="hours-title">{t.hoursTab}</h1>
      </div>
      <p className="owner-sub">{t.hoursNote}</p>
      <div className="hours stock">
        {order.map((d) => {
          const h = shop.business.hours[d];
          return (
            <div className="hours-row" key={d}>
              <label className="hours-day">
                <input type="checkbox" checked={!!h} onChange={(e) => setDay(d, e.target.checked ? [10 * 60, 21 * 60] : null)} />
                {t.weekdays[d]}
              </label>
              {h ? (
                <span className="hours-times">
                  <input
                    type="time"
                    step={900}
                    aria-label={`${t.weekdays[d]}, ${t.from}`}
                    value={clock(h[0])}
                    onChange={(e) => {
                      const v = parseClock(e.target.value);
                      if (v < h[1]) setDay(d, [v, h[1]]);
                    }}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    type="time"
                    step={900}
                    aria-label={`${t.weekdays[d]}, ${t.to}`}
                    value={clock(h[1])}
                    onChange={(e) => {
                      const v = parseClock(e.target.value);
                      if (v > h[0]) setDay(d, [h[0], v]);
                    }}
                  />
                </span>
              ) : (
                <span className="muted">{t.closed}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
