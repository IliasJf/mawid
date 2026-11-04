import { useEffect, useState } from "react";
import type { Copy } from "../lib/copy.ts";
import { dayLong, dayNumber, dayShort } from "../lib/format.ts";
import { clock, shopNow, type Slot } from "../lib/schedule.ts";

/** Keeps "now" fresh, so slots inside the lead time drop off while the page is open. */
export function useShopNow() {
  const [now, setNow] = useState(shopNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(shopNow()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Two weeks of days, then the free times on the chosen one, grouped by part of day. */
export function SlotPicker({
  t,
  name,
  today,
  dates,
  slotsByDate,
  date,
  start,
  onDate,
  onStart,
}: {
  t: Copy;
  /** Radio group name, unique on the page. */
  name: string;
  today: string;
  dates: string[];
  slotsByDate: Map<string, Slot[]>;
  date: string;
  start: number | null;
  onDate: (date: string) => void;
  onStart: (start: number) => void;
}) {
  const slots = slotsByDate.get(date) ?? [];
  const nextDay = slots.length ? undefined : dates.find((d) => d > date && (slotsByDate.get(d)?.length ?? 0) > 0);
  const groups = [
    { label: t.morning, items: slots.filter((s) => s.start < 12 * 60) },
    { label: t.afternoon, items: slots.filter((s) => s.start >= 12 * 60 && s.start < 17 * 60) },
    { label: t.evening, items: slots.filter((s) => s.start >= 17 * 60) },
  ].filter((g) => g.items.length);

  return (
    <>
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
              onClick={() => onDate(d)}
            >
              <span className="day-name">{d === today ? t.today : dayShort(t, d)}</span>
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
                  <input type="radio" name={name} value={s.start} checked={start === s.start} onChange={() => onStart(s.start)} />
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
            <button type="button" className="link-button" onClick={() => onDate(nextDay)}>
              {t.nextFree(dayLong(t, nextDay))} {t.showDay}
            </button>
          )}
        </div>
      )}
    </>
  );
}
