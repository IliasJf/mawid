import { useState } from "react";
import type { PageProps } from "../App.tsx";
import { BookingError, cancelByCustomer, findBooking, shopNow } from "../lib/schedule.ts";
import { getShop, saveShop, useShop } from "../lib/store.ts";
import { Field, LanguagePicker } from "../ui.tsx";
import { AppointmentCard } from "./AppointmentCard.tsx";

/** A customer finds their booking with its code and their number, and can cancel it. */
export function ManagePage({ t, lang, setLang }: PageProps) {
  const shop = useShop();
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<{ code: string; phone: string } | null>(null);
  const [error, setError] = useState("");
  const booking = found ? findBooking(shop, found.code, found.phone) : undefined;

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (findBooking(getShop(), code, phone)) {
      setFound({ code, phone });
      setError("");
    } else {
      setFound(null);
      setError(t.notFound);
    }
  }
  function cancel() {
    if (!found || !confirm(t.cancelConfirm)) return;
    try {
      saveShop(cancelByCustomer(getShop(), found.code, found.phone, shopNow()));
      setError("");
    } catch (cause) {
      if (cause instanceof BookingError) setError(t.errors[cause.code]);
      else throw cause;
    }
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
            <button className="btn btn--ink btn--block" type="submit">
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
            {booking.status === "cancelled" ? (
              <p role="status">{t.cancelledLead}</p>
            ) : (
              booking.status === "booked" && (
                <button className="btn btn--card" type="button" onClick={cancel}>
                  {t.cancel}
                </button>
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
