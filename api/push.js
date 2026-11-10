const crypto = require("crypto");
const { r, http, handler, requireAdmin, notify, pushEnabled } = require("./_lib");

module.exports = handler(async (req, res) => {
  if (req.method === "GET") return res.json({ enabled: pushEnabled(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
  requireAdmin(req);
  const b = req.body || {};
  if (req.method === "POST" && b.test) {
    await notify("Notificaciones activas", "Así vas a ver los turnos nuevos y cancelados.", "test");
    return res.json({ ok: true });
  }
  if (req.method === "POST") {
    const s = b.subscription;
    if (!s || !s.endpoint) throw http(400, "Suscripción inválida");
    const id = crypto.createHash("sha1").update(s.endpoint).digest("hex");
    await r(["HSET", "fz:push", id, JSON.stringify(s)]);
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    if (!b.endpoint) throw http(400, "Falta endpoint");
    await r(["HDEL", "fz:push", crypto.createHash("sha1").update(b.endpoint).digest("hex")]);
    return res.json({ ok: true });
  }
  throw http(405, "Método no permitido");
});
