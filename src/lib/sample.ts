import { addDays } from "./schedule.ts";
import type { Booking, Now, Shop, WeekHours } from "./types.ts";

const h = (open: string, close: string): [number, number] => {
  const m = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  return [m(open), m(close)];
};
// Sunday first. Friday closes for prayer and reopens later in many shops; here it opens at 14:00.
const shopHours: WeekHours = [
  null,
  h("10:00", "21:00"),
  h("10:00", "21:00"),
  h("10:00", "21:00"),
  h("10:00", "21:00"),
  h("14:00", "21:30"),
  h("09:00", "21:30"),
];
const allWeek: WeekHours = [null, h("10:00", "21:00"), h("10:00", "21:00"), h("10:00", "21:00"), h("10:00", "21:00"), h("14:00", "21:30"), h("09:00", "21:30")];
const lateShift: WeekHours = [null, h("13:00", "21:00"), null, h("13:00", "21:00"), h("13:00", "21:00"), h("14:00", "21:30"), h("12:00", "21:30")];

/** A fictional barbershop in Casablanca, with a few bookings around today. */
export function sampleShop(now: Now): Shop {
  const day = (offset: number) => addDays(now.date, offset);
  const booking = (
    id: string,
    code: string,
    serviceId: string,
    staffId: string,
    offset: number,
    at: string,
    minutes: number,
    name: string,
    phone: string,
    status: Booking["status"] = "booked",
  ): Booking => {
    const start = Number(at.slice(0, 2)) * 60 + Number(at.slice(3));
    return {
      id,
      code,
      serviceId,
      staffId,
      date: day(offset),
      start,
      end: start + minutes,
      customer: { name, phone },
      note: "",
      status,
      createdAt: `${day(Math.min(offset, 0) - 1)}T18:20`,
    };
  };
  return {
    version: 1,
    business: {
      name: "Atlas Barbers",
      tagline: {
        en: "Cuts, fades and hot-towel shaves on Rue Tahar Sebti.",
        fr: "Coupes, dégradés et rasage à la serviette chaude, rue Tahar Sebti.",
        ar: "حلاقة، تدرّج وحلاقة بالمنشفة الساخنة في شارع الطاهر السبتي.",
      },
      city: "Casablanca",
      address: "Rue Tahar Sebti, Maârif, Casablanca",
      whatsapp: "212600000000",
      hours: shopHours,
      slotStep: 15,
      leadMinutes: 30,
      horizonDays: 14,
    },
    services: [
      { id: "cut", name: { en: "Haircut", fr: "Coupe", ar: "قصة شعر" }, minutes: 30, price: 60, active: true },
      { id: "fade", name: { en: "Skin fade", fr: "Dégradé à blanc", ar: "تدرّج كامل" }, minutes: 45, price: 80, active: true },
      { id: "beard", name: { en: "Beard trim", fr: "Taille de barbe", ar: "تهذيب اللحية" }, minutes: 20, price: 40, active: true },
      { id: "shave", name: { en: "Hot-towel shave", fr: "Rasage serviette chaude", ar: "حلاقة بالمنشفة الساخنة" }, minutes: 30, price: 70, active: true },
      { id: "combo", name: { en: "Cut and beard", fr: "Coupe et barbe", ar: "قصة ولحية" }, minutes: 50, price: 90, active: true },
      { id: "kids", name: { en: "Kids' cut (under 12)", fr: "Coupe enfant (moins de 12 ans)", ar: "قصة أطفال (أقل من 12 سنة)" }, minutes: 25, price: 40, active: true },
    ],
    staff: [
      { id: "youssef", name: "Youssef", serviceIds: ["cut", "fade", "beard", "shave", "combo"], hours: allWeek, active: true },
      { id: "hamza", name: "Hamza", serviceIds: ["cut", "fade", "beard", "combo", "kids"], hours: allWeek, active: true },
      { id: "anas", name: "Anas", serviceIds: ["cut", "beard", "shave", "kids"], hours: lateShift, active: true },
    ],
    bookings: [
      booking("s1", "K7MQ3T", "fade", "youssef", 0, "11:00", 45, "Mehdi Benali", "212661234501"),
      booking("s2", "PX4HDA", "beard", "youssef", 0, "12:00", 20, "Karim El Idrissi", "212662234502"),
      booking("s3", "WN9CEF", "cut", "hamza", 0, "11:30", 30, "Omar Tazi", "212663234503"),
      booking("s4", "QT6RJY", "combo", "hamza", 0, "17:00", 50, "Adam Alaoui", "212664234504"),
      booking("s5", "DM3VKU", "shave", "anas", 0, "18:00", 30, "Rachid Amrani", "212665234505"),
      booking("s6", "HC7NWX", "kids", "anas", 1, "16:00", 25, "Yassine Chraibi", "212666234506"),
      booking("s7", "RA4PGM", "cut", "youssef", 1, "10:30", 30, "Samir Fassi", "212667234507"),
      booking("s8", "FE9TQD", "fade", "hamza", -1, "15:00", 45, "Nabil Kettani", "212668234508", "done"),
      booking("s9", "UY6KCH", "cut", "youssef", -1, "19:00", 30, "Ilyas Berrada", "212669234509", "no-show"),
    ],
    blocks: [
      { id: "b1", staffId: "youssef", date: day(0), start: 14 * 60, end: 15 * 60, reason: "Lunch" },
      { id: "b2", staffId: "hamza", date: day(0), start: 14 * 60 + 30, end: 15 * 60 + 30, reason: "Lunch" },
    ],
  };
}
