/**
 * Demo catalog for the design stage.
 * These figures are not a payment and not a stored booking.
 * The VIP package has no approved price — do not invent one.
 * Replace this file later with Supabase or another backend.
 */
window.VIP_DEMO = {
  temporary: true,
  owner: {
    name: "זאבי הנאו"
  },
  services: [
    {
      id: "mens-haircut",
      name: "תספורת גברים",
      summary: "תספורת בהתאמה אישית.",
      priceIls: 65,
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
      priceIls: 15,
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
