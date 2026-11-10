const crypto = require("crypto");

/* ============ CONFIGURACIÓN DEL NEGOCIO (editar acá) ============ */
const CONFIG = {
  name: "FZ Studio Barber",
  phone: "5492323448740",
  phoneDisplay: "+54 2323 448740",
  instagram: "fz.sstudio",
  city: "Luján, Buenos Aires",
  mapsQuery: "FZ Studio Barber Luján Buenos Aires",
  step: 60,        // minutos entre turnos (duración del servicio)
  daysAhead: 21,   // días a futuro que se pueden reservar
  services: [
    { id: "corte", name: "Corte (cejas incluidas)", desc: "Corte de cabello y perfilado de cejas. Preciso, prolijo y adaptado a tu estilo.", price: 12000, min: 60 }
  ],
  // 0=Dom ... 6=Sáb. null = cerrado. [apertura, cierre]
  hours: {
    0: null, 1: null, 2: null,
    3: ["15:30", "18:00"],
    4: ["14:30", "18:00"],
    5: ["14:30", "17:00"],
    6: ["14:30", "20:00"]
  }
};
/* ================================================================= */

const DB_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const DB_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const http = (status, message) => Object.assign(new Error(message), { status });

async function r(cmd) {
  if (!DB_URL || !DB_TOKEN) throw http(503, "Base de datos no configurada");
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + DB_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const TZ = "America/Argentina/Buenos_Aires";
function arNow() {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: TZ }),
    time: d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
  };
}
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

function slotsFor(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return [];
  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  const h = CONFIG.hours[dow];
  if (!h) return [];
  const out = [];
  for (let t = toMin(h[0]); t + CONFIG.step <= toMin(h[1]); t += CONFIG.step) out.push(fromMin(t));
  return out;
}
function isPast(date, time) {
  const n = arNow();
  return date < n.date || (date === n.date && time <= n.time);
}
function inRange(date) {
  const n = arNow();
  const max = new Date(new Date(n.date + "T00:00:00Z").getTime() + CONFIG.daysAhead * 864e5).toISOString().slice(0, 10);
  return date >= n.date && date <= max;
}
const lockKey = (d, t) => `fz:lock:${d}:${t}`;

async function createBooking(data, { allowPast = false } = {}) {
  const { date, time } = data;
  if (!slotsFor(date).includes(time)) throw http(400, "Horario inválido");
  if (!allowPast && isPast(date, time)) throw http(400, "Ese horario ya pasó");
  const id = crypto.randomUUID();
  const ok = await r(["SET", lockKey(date, time), id, "NX"]);
  if (ok !== "OK") throw http(409, "Ese horario ya fue tomado, elegí otro");
  const b = { id, ...data, created: Date.now() };
  try { await r(["HSET", "fz:b", id, JSON.stringify(b)]); }
  catch (e) { await r(["DEL", lockKey(date, time)]); throw e; }
  return b;
}

function handler(fn) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { await fn(req, res); }
    catch (e) {
      res.status(e.status || 500).json({ error: e.status ? e.message : "Error del servidor" });
      if (!e.status) console.error(e);
    }
  };
}

function requireAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw http(503, "Falta configurar ADMIN_PASSWORD en Vercel");
  const given = String(req.headers["x-admin-key"] || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(pass).digest();
  if (!crypto.timingSafeEqual(a, b)) throw http(401, "Contraseña incorrecta");
}

const clean = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);

module.exports = { CONFIG, r, http, arNow, slotsFor, isPast, inRange, lockKey, createBooking, handler, requireAdmin, clean };
