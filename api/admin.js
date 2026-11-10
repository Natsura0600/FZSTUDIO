const {
  CONFIG, r, rp, http, arNow, addDays, slotsFor, monthKey, slotField, bump, createBooking, getBooking,
  cancelBooking, loadRange, handler, requireAdmin, clean
} = require("./_lib");

const STATUSES = ["confirmed", "completed", "noshow"];
const phoneOf = s => String(s || "").replace(/[^\d+]/g, "").slice(0, 16);

module.exports = handler(async (req, res) => {
  requireAdmin(req);
  const m = req.method, today = arNow().date;

  if (m === "GET") {
    // El panel manda la versión que ya tiene: si no cambió, respondemos con 1 solo comando.
    const known = String(req.query.v || "");
    const cur = String((await r(["GET", "fz:v"])) || "0");
    if (known && known === cur) return res.json({ changed: false, v: cur, today });
    const bookings = await loadRange(addDays(today, -90), addDays(today, CONFIG.daysAhead + 7));
    return res.json({ changed: true, v: cur, today, bookings });
  }

  if (m === "POST") {
    const b = req.body || {};
    const date = String(b.date || ""), time = String(b.time || "");

    if (b.action === "block") {
      const x = await createBooking({ name: "Horario bloqueado", phone: "", date, time, service: "", serviceName: "", price: 0, status: "blocked", source: "admin" }, { allowPast: true });
      return res.json({ ok: true, booking: x });
    }
    if (b.action === "blockday") {
      const times = slotsFor(date);
      if (!times.length) throw http(400, "Ese día no se atiende");
      const cmds = times.map(t => {
        const k = slotField(date, t);
        return ["HSETNX", monthKey(date), k, JSON.stringify({ id: crypto_id(), k, name: "Día bloqueado", phone: "", date, time: t, service: "", serviceName: "", price: 0, status: "blocked", source: "admin", created: Date.now() })];
      });
      await rp([...cmds, bump()]);
      return res.json({ ok: true });
    }
    if (b.action === "move") {
      const old = await getBooking(b.k);
      if (!old) throw http(404, "Turno no encontrado");
      if (!slotsFor(date).includes(time)) throw http(400, "Horario inválido");
      const nk = slotField(date, time);
      const nb = { ...old, date, time, k: nk };
      const [ok] = await rp([["HSETNX", monthKey(date), nk, JSON.stringify(nb)]]);
      if (ok !== 1) throw http(409, "Ese horario ya está ocupado");
      await rp([["HDEL", monthKey(old.date), old.k], bump()]);
      return res.json({ ok: true });
    }
    const name = clean(b.name, 60);
    if (name.length < 2) throw http(400, "Ingresá el nombre");
    const svc = CONFIG.services.find(s => s.id === b.service) || CONFIG.services[0];
    const x = await createBooking({
      name, phone: phoneOf(b.phone), date, time, service: svc.id, serviceName: svc.name, price: svc.price,
      status: "confirmed", source: "admin", note: clean(b.note, 200)
    }, { allowPast: true });
    return res.json({ ok: true, booking: x });
  }

  if (m === "PATCH") {
    const { k, status, note } = req.body || {};
    const b = await getBooking(k);
    if (!b) throw http(404, "Turno no encontrado");
    if (typeof note === "string") {
      b.note = clean(note, 200);
      await rp([["HSET", monthKey(b.date), b.k, JSON.stringify(b)], bump()]);
      return res.json({ ok: true });
    }
    if (status === "cancelled") { await cancelBooking(b); return res.json({ ok: true }); }
    if (!STATUSES.includes(status)) throw http(400, "Estado inválido");
    b.status = status;
    await rp([["HSET", monthKey(b.date), b.k, JSON.stringify(b)], bump()]);
    return res.json({ ok: true });
  }

  if (m === "DELETE") {
    const k = String(req.query.k || "");
    const b = await getBooking(k);
    if (!b) throw http(404, "Turno no encontrado");
    await rp([["HDEL", monthKey(b.date), k], bump()]);
    return res.json({ ok: true });
  }

  throw http(405, "Método no permitido");
});

function crypto_id() { return require("crypto").randomUUID(); }
