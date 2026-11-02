import type { Copy } from "./copy.ts";
import { clock } from "./schedule.ts";
import type { Booking, Business, Service, Staff } from "./types.ts";

const at = (date: string) => new Date(date + "T12:00:00Z");

export const dayLong = (t: Copy, date: string) =>
  new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(at(date));
export const dayShort = (t: Copy, date: string) =>
  new Intl.DateTimeFormat(t.locale, { weekday: "short", timeZone: "UTC" }).format(at(date));
export const dayNumber = (t: Copy, date: string) =>
  new Intl.DateTimeFormat(t.locale, { day: "numeric", timeZone: "UTC" }).format(at(date));
export const monthShort = (t: Copy, date: string) =>
  new Intl.DateTimeFormat(t.locale, { month: "short", timeZone: "UTC" }).format(at(date));
export const price = (t: Copy, dh: number) => `${new Intl.NumberFormat(t.locale).format(dh)} ${t.dh}`;
export const minutes = (t: Copy, m: number) =>
  m < 60 ? `${m} ${t.minutes}` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`;

export const whatsappUrl = (number: string, text: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** A one-event calendar file, in shop-local time with the Casablanca zone named. */
export function calendarFile(booking: Booking, business: Business, service: Service, staff: Staff, title: string) {
  const stamp = (date: string, m: number) => `${date.replaceAll("-", "")}T${clock(m).replace(":", "")}00`;
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mawid//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@mawid`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Africa/Casablanca:${stamp(booking.date, booking.start)}`,
    `DTEND;TZID=Africa/Casablanca:${stamp(booking.date, booking.end)}`,
    `SUMMARY:${escape(`${title} · ${business.name}`)}`,
    `LOCATION:${escape(business.address)}`,
    `DESCRIPTION:${escape(`${staff.name} · ${booking.code}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
