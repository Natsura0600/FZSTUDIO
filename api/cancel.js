const { CONFIG, http, getBooking, cancelBooking, parseToken, notify, handler, shortDate } = require("./_lib");

async function find(t) {
  const p = parseToken(t);
  if (!p) throw http(404, "Link inválido");
  const b = await getBooking(`${p.date}|${p.time}`);
  if (!b || b.id !== p.id || b.status !== "confirmed") throw http(404, "Este turno no existe o ya fue cancelado");
  return b;
}
const minutesLeft = b => (Date.parse(`${b.date}T${b.time}:00-03:00`) - Date.now()) / 60000;

module.exports = handler(async (req, res) => {
  if (req.method === "GET") {
    const b = await find(req.query.t);
    return res.json({
      name: b.name, date: b.date, time: b.time, serviceName: b.serviceName,
      canCancel: minutesLeft(b) >= CONFIG.cancelMinHours * 60, minHours: CONFIG.cancelMinHours, phone: CONFIG.phone
    });
  }
  if (req.method === "POST") {
    const b = await find((req.body || {}).t);
    if (minutesLeft(b) < CONFIG.cancelMinHours * 60)
      throw http(400, `Solo se puede cancelar hasta ${CONFIG.cancelMinHours} hs antes. Escribinos por WhatsApp.`);
    await cancelBooking(b);
    await notify("Turno cancelado", `${b.name} · ${shortDate(b.date)} ${b.time} hs`, "cancel-" + b.id);
    return res.json({ ok: true });
  }
  throw http(405, "Método no permitido");
});
