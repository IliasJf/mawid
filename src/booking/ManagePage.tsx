import { useMemo, useState } from "react";
import type { PageProps } from "../App.tsx";
import { BookingError, availableSlots, bookableDates } from "../lib/schedule.ts";
import { cancelVisit, findVisit, moveVisit, problemText } from "../lib/backend.ts";
import { useShop } from "../lib/store.ts";
import type { Booking } from "../lib/types.ts";
import { Field, LanguagePicker } from "../ui.tsx";
import { AppointmentCard } from "./AppointmentCard.tsx";
import { SlotPicker, useShopNow } from "./SlotPicker.tsx";

/** A customer finds their booking with its code and their number, and can move or cancel it. */
export function ManagePage({ t, lang, setLang }: PageProps) {
  const shop = useShop();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  // What the customer typed, and their booking as the shop last returned it.
  const [found, setFound] = useState<{ code: string; phone: string; booking: Booking } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [moved, setMoved] = useState(false);
  const now = useShopNow();
  const booking = found?.booking;
  const [date, setDate] = useState("");
  const [start, setStart] = useState<number | null>(null);

  // Free times for the same service with anyone; the booking's own time doesn't block itself.
  const dates = bookableDates(shop, now);
  const slotsByDate = useMemo(
    () =>
      new Map(
        dates.map((d) => [
          d,
          booking
            ? availableSlots(shop, booking.serviceId, "any", d, now, { ignore: booking.id }).filter(
                (s) => !(d === booking.date && s.start === booking.start),
              )
            : [],
        ]),
      ),
    [shop, booking?.id, booking?.date, booking?.start, now, dates.join()],
  );

  /** Runs one request to the shop, showing its problem if it fails. */
  async function attempt(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setError("");
    } catch (cause) {
      setError(problemText(t, cause));
      if (cause instanceof BookingError && cause.code === "slot-taken") setStart(null);
    } finally {
      setBusy(false);
    }
  }

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    void attempt(async () => {
      try {
        setFound({ code, phone, booking: await findVisit(code, phone) });
      } catch (cause) {
        setFound(null);
        throw cause;
      }
    });
  }
  function startChange() {
    if (!booking) return;
    setDate(dates.includes(booking.date) ? booking.date : now.date);
    setStart(null);
    setError("");
    setMoved(false);
    setChanging(true);
  }
  function saveMove(e: React.FormEvent) {
    e.preventDefault();
    if (!found) return;
    if (start === null) {
      setError(t.chooseFirst);
      return;
    }
    void attempt(async () => {
      const next = await moveVisit(found.code, found.phone, { date, start, staffChoice: "any" });
      setFound({ ...found, booking: next });
      setChanging(false);
      setMoved(true);
      scrollTo({ top: 0 });
    });
  }
  function cancel() {
    if (!found || !confirm(t.cancelConfirm)) return;
    void attempt(async () => setFound({ ...found, booking: await cancelVisit(found.code, found.phone) }));
  }

  return (
    <div className="page page-book">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href="#/">
            {shop.business.name}
          </a>
          <nav className="topbar-actions" aria-label={t.manageTitle}>
            <a href="#/">{t.back}</a>
            <LanguagePicker t={t} lang={lang} setLang={setLang} />
          </nav>
        </div>
      </header>
      <main className="container manage" id="main">
        <h1>{t.manageTitle}</h1>
        {!booking ? (
          <form className="manage-form stock" onSubmit={lookup} noValidate>
            <Field label={t.code} id="code">
              <input
                id="code"
                className="fig"
                dir="ltr"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label={t.phone} id="manage-phone">
              <input
                id="manage-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn--ink btn--block" type="submit" aria-busy={busy || undefined}>
              {t.find}
            </button>
          </form>
        ) : (
          <div className="manage-result">
            <div className="desk">
              <AppointmentCard
                shop={shop}
                booking={booking}
                t={t}
                lang={lang}
                stamp={booking.status === "cancelled" ? t.cancelled : t.status[booking.status]}
              />
            </div>
            {moved && booking.status === "booked" && <p role="status">{t.movedLead}</p>}
            {booking.status === "cancelled" ? (
              <p role="status">{t.cancelledLead}</p>
            ) : changing ? (
              <form className="change-time stock" onSubmit={saveMove} noValidate aria-labelledby="change-title">
                <h2 id="change-title">{t.changeTitle}</h2>
                <SlotPicker
                  t={t}
                  name="new-slot"
                  today={now.date}
                  dates={dates}
                  slotsByDate={slotsByDate}
                  date={date}
                  start={start}
                  onDate={(d) => {
                    setDate(d);
                    setStart(null);
                  }}
                  onStart={(s) => {
                    setStart(s);
                    setError("");
                  }}
                />
                <div className="manage-actions">
                  <button className="btn btn--ink" type="submit" aria-busy={busy || undefined}>
                    {t.saveMove}
                  </button>
                  <button className="btn btn--quiet" type="button" onClick={() => setChanging(false)}>
                    {t.keepTime}
                  </button>
                </div>
              </form>
            ) : (
              booking.status === "booked" && (
                <div className="manage-actions">
                  <button className="btn btn--ink" type="button" onClick={startChange}>
                    {t.changeTime}
                  </button>
                  <button className="btn btn--card" type="button" onClick={cancel}>
                    {t.cancel}
                  </button>
                </div>
              )
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <a className="link-button" href="#/">
              {t.bookAnother}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
