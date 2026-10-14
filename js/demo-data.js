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
      summary: "תספורת מדויקת אצלך בבית, בקו נקי שמתאים לשיער ולסגנון.",
      priceIls: 65,
      temporaryPrice: true
    },
    {
      id: "beard",
      name: "סידור זקן",
      summary: "עיצוב וטיפוח זקן עד הבית, בקו חד ובלי המתנה במספרה.",
      priceIls: 15,
      temporaryPrice: true
    },
    {
      id: "kids-haircut",
      name: "תספורת ילדים",
      summary: "תספורת רגועה לילדים, בבית ובקצב שנוח להם.",
      priceIls: 55,
      temporaryPrice: true
    },
    {
      id: "vip-package",
      name: "חבילת VIP",
      summary: "ביקור משולב של תספורת וטיפוח, בתיאום אישי עם זאבי הנאו.",
      priceIls: null,
      priceOnRequest: true
    }
  ]
};
