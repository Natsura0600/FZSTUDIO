const { CONFIG, http, inRange, createBooking, notify, handler, clean, shortDate, makeToken, clientIp } = require("./_lib");
const hits = new Map();

module.exports = handler(async (req, res) => {
  if (req.method !== "POST") throw http(405, "Método no permitido");
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot anti-spam
  // límite por IP (en memoria, no gasta comandos de Redis): máx. 6 reservas por hora
  const ip = clientIp(req), now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 6) throw http(429, "Demasiados intentos. Probá más tarde o escribinos por WhatsApp.");
  recent.push(now); hits.set(ip, recent);
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
