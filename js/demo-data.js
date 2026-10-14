/**
 * Demo catalog for the design stage.
 * These figures are not a payment and not a stored booking.
 * The VIP package has no approved price — do not invent one.
 * Replace this file later with Supabase or another backend.
 */
window.VIP_DEMO = {
  temporary: true,
  owner: {
    name: "זאבי הנאו",
    // WhatsApp number for wa.me: country code plus the mobile number, digits only.
    // No plus, spaces, or leading 0.
    whatsappPhone: "972512177021"
  },
  services: [
    {
      id: "mens-haircut",
      name: "תספורת גברים",
      summary: "תספורת בהתאמה אישית.",
      priceIls: 70,
      temporaryPrice: true
    },
    {
      id: "kids-haircut",
      name: "תספורת ילדים",
      summary: "תספורת לילדים באווירה נעימה, עם תוצאה מדויקת לכל גיל.",
      priceIls: 55,
      temporaryPrice: true
    },
    {
      id: "beard",
      name: "סידור זקן",
      summary: "תוספת לביקור, לא כרטיס שירות נפרד.",
      priceIls: 10,
      temporaryPrice: true,
      addon: true
    },
    {
      id: "vip-package",
      name: "חבילת VIP",
      summary: "חוויית טיפוח אישית עד הבית, עם שירות מוקפד, תשומת לב לכל פרט והתאמה לסגנון שלך.",
      priceIls: null,
      priceOnRequest: true
    }
  ]
};

/**
 * Availability shape for a future booking connection.
 * syncedWithBookings is false: customer visits do not read saved weeks.
 * Day status:
 *   unset  — hours were never defined. Do not invent slots.
 *   closed — the barber marked the day unavailable.
 *   hours  — start and end were set. Slots can be derived later.
 * Customer demo hours are temporary and are not a real availability promise.
 * Each haircut is 30 minutes.
 * Sunday–Thursday: 17:00–21:00. Friday: 09:00–12:00. Saturday is closed.
 * Saved admin weeks stay separate until a real booking connection exists.
 */
window.VIP_SCHEDULE = {
  temporary: true,
  syncedWithBookings: false,
  storageKey: "vip-week-availability",
  weekdays: [
    { id: "0", label: "ראשון" },
    { id: "1", label: "שני" },
    { id: "2", label: "שלישי" },
    { id: "3", label: "רביעי" },
    { id: "4", label: "חמישי" },
    { id: "5", label: "שישי" },
    { id: "6", label: "שבת" }
  ],
  standing: {
    "0": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "1": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "2": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "3": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "4": { status: "hours", start: "17:00", end: "21:00", slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"], temporary: true },
    "5": { status: "hours", start: "09:00", end: "12:00", slots: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"], temporary: true },
    "6": { status: "closed" }
  }
};
