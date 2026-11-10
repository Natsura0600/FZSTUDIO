const { CONFIG, http, inRange, createBooking, notify, handler, clean, shortDate, makeToken } = require("./_lib");

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") throw http(405, "Método no permitido");
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot anti-spam
  const name = clean(b.name, 60);
  const phone = String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 16);
  if (name.length < 2) throw http(400, "Ingresá tu nombre");
  if (phone.replace(/\D/g, "").length < 8) throw http(400, "Ingresá un teléfono válido");
  const date = String(b.date || ""), time = String(b.time || "");
  if (!inRange(date)) throw http(400, "Fecha fuera de rango");
  const svc = CONFIG.services.find(s => s.id === b.service) || CONFIG.services[0];
  const booking = await createBooking({
    name, phone, date, time,
    service: svc.id, serviceName: svc.name, price: svc.price,
    status: "confirmed", source: "web"
  });
  await notify("Nuevo turno", `${name} · ${shortDate(date)} ${time} hs`, "new-" + booking.id);
  res.json({ ok: true, token: makeToken(booking), booking: { date, time, serviceName: svc.name, price: svc.price, name } });
});
