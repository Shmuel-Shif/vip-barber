/**
 * TEMPORARY demo catalog.
 * These prices are placeholders for the design stage only.
 * They are not a real offer, not a payment, and not stored bookings.
 * Replace this file later with Supabase or another backend.
 */
window.VIP_BARBER_DEMO = {
  temporary: true,
  barber: {
    name: "זאבי הנאו"
  },
  services: [
    { id: "mens-haircut", name: "תספורת גברים", priceIls: 180, temporaryPrice: true },
    { id: "beard", name: "סידור זקן", priceIls: 90, temporaryPrice: true },
    { id: "kids-haircut", name: "תספורת ילדים", priceIls: 120, temporaryPrice: true },
    { id: "vip-package", name: "חבילת VIP", priceIls: 280, temporaryPrice: true }
  ]
};
