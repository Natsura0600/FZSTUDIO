const { CONFIG, r, http, createBooking, lockKey, handler, requireAdmin, clean } = require("./_lib");

const STATUSES = ["confirmed", "completed", "cancelled", "noshow"];

async function load() {
  const flat = (await r(["HGETALL", "fz:b"])) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i])); } catch {} }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

module.exports = handler(async (req, res) => {
  requireAdmin(req);
  const m = req.method;

  if (m === "GET") return res.json({ bookings: await load() });

  if (m === "POST") {
    const b = req.body || {};
    const date = String(b.date || ""), time = String(b.time || "");
    if (b.action === "block") {
      const x = await createBooking({ name: "Horario bloqueado", phone: "", date, time, service: "", serviceName: "", price: 0, status: "blocked", source: "admin" }, { allowPast: true });
      return res.json({ ok: true, booking: x });
    }
    const name = clean(b.name, 60);
    if (name.length < 2) throw http(400, "Ingresá el nombre");
    const svc = CONFIG.services.find(s => s.id === b.service) || CONFIG.services[0];
    const x = await createBooking({
      name, phone: String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 16),
      date, time, service: svc.id, serviceName: svc.name, price: svc.price,
      status: "confirmed", source: "admin"
    }, { allowPast: true });
    return res.json({ ok: true, booking: x });
  }

  if (m === "PATCH") {
    const { id, status } = req.body || {};
    if (!STATUSES.includes(status)) throw http(400, "Estado inválido");
    const raw = await r(["HGET", "fz:b", String(id)]);
    if (!raw) throw http(404, "Turno no encontrado");
    const b = JSON.parse(raw);
    b.status = status;
    await r(["HSET", "fz:b", b.id, JSON.stringify(b)]);
    if (status === "cancelled") await r(["DEL", lockKey(b.date, b.time)]);
    return res.json({ ok: true, booking: b });
  }

  if (m === "DELETE") {
    const id = String(req.query.id || "");
    const raw = await r(["HGET", "fz:b", id]);
    if (!raw) throw http(404, "Turno no encontrado");
    const b = JSON.parse(raw);
    await r(["HDEL", "fz:b", id]);
    await r(["DEL", lockKey(b.date, b.time)]);
    return res.json({ ok: true });
  }

  throw http(405, "Método no permitido");
});
