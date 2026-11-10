const crypto = require("crypto");

/* ============ CONFIGURACIÓN DEL NEGOCIO (editar acá) ============ */
const CONFIG = {
  name: "FZ Studio Barber",
  phone: "5492323448740",
  phoneDisplay: "+54 2323 448740",
  instagram: "fz.sstudio",
  city: "La Concepción Country Club, Luján",
  mapsQuery: "La Concepción Country Club Luján Buenos Aires",
  step: 60,           // minutos entre turnos (duración del servicio)
  daysAhead: 21,      // días a futuro que se pueden reservar
  cancelMinHours: 2,  // el cliente puede cancelar hasta X horas antes
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

/*
  Modelo de datos (pensado para gastar pocos comandos de Redis):
  - fz:m:YYYY-MM  -> hash por mes. Campo "fecha|hora" = turno activo (HSETNX = reserva atómica).
                     Campo "fecha|hora|x|id" = turno cancelado (historial).
  - fz:v          -> contador de versión; sube con cada cambio. El panel lo consulta (1 comando)
                     y solo recarga los datos cuando cambió.
  - fz:push       -> suscripciones de notificaciones push del dueño.
*/

const DB_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const DB_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const http = (status, message) => Object.assign(new Error(message), { status });

async function call(path, body) {
  if (!DB_URL || !DB_TOKEN) throw http(503, "Base de datos no configurada");
  const res = await fetch(DB_URL + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + DB_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}
async function r(cmd) {
  const j = await call("", cmd);
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function rp(cmds) { // varios comandos en un solo viaje
  const arr = await call("/pipeline", cmds);
  if (!Array.isArray(arr)) throw new Error(arr && arr.error ? arr.error : "pipeline");
  return arr.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const TZ = "America/Argentina/Buenos_Aires";
function arNow() {
  const d = new Date();
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: TZ }),
    time: d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  };
}
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const addDays = (s, n) => new Date(new Date(s + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

function slotsFor(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return [];
  const h = CONFIG.hours[new Date(date + "T00:00:00Z").getUTCDay()];
  if (!h) return [];
  const out = [];
  for (let t = toMin(h[0]); t + CONFIG.step <= toMin(h[1]); t += CONFIG.step) out.push(fromMin(t));
  return out;
}
function isPast(date, time) { const n = arNow(); return date < n.date || (date === n.date && time <= n.time); }
function inRange(date) { const n = arNow(); return date >= n.date && date <= addDays(n.date, CONFIG.daysAhead); }

const monthKey = date => "fz:m:" + date.slice(0, 7);
const slotField = (d, t) => `${d}|${t}`;
const bump = () => ["INCR", "fz:v"];

async function createBooking(data, { allowPast = false } = {}) {
  const { date, time } = data;
  if (!slotsFor(date).includes(time)) throw http(400, "Horario inválido");
  if (!allowPast && isPast(date, time)) throw http(400, "Ese horario ya pasó");
  const id = crypto.randomUUID();
  const k = slotField(date, time);
  const b = { id, k, ...data, created: Date.now() };
  const [ok] = await rp([["HSETNX", monthKey(date), k, JSON.stringify(b)], bump()]);
  if (ok !== 1) throw http(409, "Ese horario ya fue tomado, elegí otro");
  return b;
}

async function getBooking(k) {
  const date = String(k || "").split("|")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const raw = await r(["HGET", monthKey(date), k]);
  return raw ? JSON.parse(raw) : null;
}

async function cancelBooking(b) {
  const nk = `${b.date}|${b.time}|x|${b.id}`;
  const nb = { ...b, k: nk, status: "cancelled", cancelledAt: Date.now() };
  const mk = monthKey(b.date);
  await rp([["HDEL", mk, b.k], ["HSET", mk, nk, JSON.stringify(nb)], bump()]);
  return nb;
}

async function loadRange(from, to) {
  const months = [];
  for (let d = from.slice(0, 7); d <= to.slice(0, 7);) {
    months.push(d);
    let [y, m] = d.split("-").map(Number); m++; if (m > 12) { m = 1; y++; }
    d = `${y}-${String(m).padStart(2, "0")}`;
  }
  const res = await rp(months.map(m => ["HGETALL", "fz:m:" + m]));
  const out = [];
  for (const flat of res) for (let i = 1; i < (flat || []).length; i += 2) {
    try { const b = JSON.parse(flat[i]); if (b.date >= from && b.date <= to) out.push(b); } catch {}
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/* ---- notificaciones push (opcional: requiere claves VAPID) ---- */
const pushEnabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
async function notify(title, body, tag) {
  if (!pushEnabled()) return;
  try {
    const wp = require("web-push");
    wp.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@fzstudio.local", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const flat = (await r(["HGETALL", "fz:push"])) || [];
    const payload = JSON.stringify({ title, body, tag });
    const jobs = [];
    for (let i = 0; i < flat.length; i += 2) {
      const field = flat[i];
      let sub; try { sub = JSON.parse(flat[i + 1]); } catch { continue; }
      jobs.push(wp.sendNotification(sub, payload, { TTL: 86400 }).catch(async e => {
        if (e.statusCode === 404 || e.statusCode === 410) await r(["HDEL", "fz:push", field]).catch(() => {});
      }));
    }
    await Promise.allSettled(jobs);
  } catch (e) { console.error("push", e.message); }
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

const clientIp = req => String((req.headers && req.headers["x-forwarded-for"]) || "x").split(",")[0].trim();
const fails = new Map(); // límite de intentos en memoria (sin gastar comandos de Redis)
function requireAdmin(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw http(503, "Falta configurar ADMIN_PASSWORD en Vercel");
  const ip = clientIp(req), f = fails.get(ip);
  if (f && f.n >= 8 && Date.now() - f.t < 15 * 60000) throw http(429, "Demasiados intentos. Probá en 15 minutos");
  const given = String(req.headers["x-admin-key"] || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(pass).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    fails.set(ip, { n: (f && Date.now() - f.t < 15 * 60000 ? f.n : 0) + 1, t: Date.now() });
    throw http(401, "Contraseña incorrecta");
  }
  fails.delete(ip);
}

const clean = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);
const shortDate = d => d.slice(8, 10) + "/" + d.slice(5, 7);
const makeToken = b => Buffer.from(`${b.date}|${b.time}|${b.id}`).toString("base64url");
function parseToken(t) {
  try { const [date, time, id] = Buffer.from(String(t), "base64url").toString().split("|"); if (date && time && id) return { date, time, id }; } catch {}
  return null;
}

module.exports = {
  CONFIG, r, rp, http, arNow, addDays, slotsFor, isPast, inRange, monthKey, slotField, bump,
  createBooking, getBooking, cancelBooking, loadRange, notify, pushEnabled, handler, requireAdmin,
  clean, shortDate, makeToken, parseToken, clientIp
};
