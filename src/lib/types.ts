export type Lang = "en" | "fr" | "ar";
export type Text = Record<Lang, string>;

/** Minutes since midnight, shop-local time (Africa/Casablanca). */
export type Minutes = number;
/** Opening hours for one weekday: [open, close] in minutes, or null when closed. */
export type DayHours = [Minutes, Minutes] | null;
/** Index 0 is Sunday, as in Date.getUTCDay(). */
export type WeekHours = [
  DayHours,
  DayHours,
  DayHours,
  DayHours,
  DayHours,
  DayHours,
  DayHours,
];

export interface Business {
  name: string;
  tagline: Text;
  city: string;
  address: string;
  /** WhatsApp number in international form without "+", e.g. 212612345678. */
  whatsapp: string;
  hours: WeekHours;
  /** Slots start on this grid, in minutes. */
  slotStep: number;
  /** How soon a customer may book, in minutes from now. */
  leadMinutes: number;
  /** How many days ahead customers may book, today included. */
  horizonDays: number;
}

export interface Service {
  id: string;
  name: Text;
  minutes: number;
  /** Price in dirhams. */
  price: number;
  active: boolean;
}

export interface Staff {
  id: string;
  name: string;
  /** Services this person does. */
  serviceIds: string[];
  /** Personal hours, intersected with the shop's. */
  hours: WeekHours;
  active: boolean;
}

export type BookingStatus = "booked" | "done" | "no-show" | "cancelled";

export interface Booking {
  id: string;
  /** Short code the customer quotes to change or cancel. */
  code: string;
  serviceId: string;
  staffId: string;
  /** YYYY-MM-DD */
  date: string;
  start: Minutes;
  end: Minutes;
  customer: { name: string; phone: string };
  note: string;
  status: BookingStatus;
  createdAt: string;
}

export interface Block {
  id: string;
  staffId: string;
  date: string;
  start: Minutes;
  end: Minutes;
  reason: string;
}

export interface Shop {
  version: 1;
  business: Business;
  services: Service[];
  staff: Staff[];
  bookings: Booking[];
  blocks: Block[];
}

/** The shop's current wall-clock time. */
export interface Now {
  date: string;
  minutes: Minutes;
}
