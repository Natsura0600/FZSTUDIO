const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + (n || 0).toLocaleString("es-AR");
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LABEL = { confirmed: "Confirmado", completed: "Realizado", cancelled: "Cancelado", noshow: "No vino", blocked: "Bloqueado" };
const addDays = (s, n) => new Date(new Date(s + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
const dow = s => new Date(s + "T00:00:00Z").getUTCDay();
const dlabel = s => `${DAYS[dow(s)]} ${+s.slice(8)} de ${MONTHS[+s.slice(5, 7) - 1]}`;
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

let KEY = ""; try { KEY = localStorage.getItem("fz_admin_key") || ""; } catch {}
let C = null, bookings = [], v = "", today = "", prev = null;
let tab = "agenda", sub = "upcoming", day = "", q = "", mode = "book", editK = "", presetTime = "";

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", "x-admin-key": KEY, ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || "Error"), { status: res.status });
  return j;
}
const show = logged => { $("#loginView").hidden = logged; $("#appView").hidden = !logged; };

function toast(msg, bad) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 5000);
}
async function sysNotify(title, body, tag) {
  toast(title + ": " + body, title.includes("cancel"));
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, tag, icon: "/img/icon-192.png" });
    }
  } catch {}
}

/* ---- carga de datos: 1 comando si no hubo cambios ---- */
async function load(silent) {
  try {
    if (!C) C = await (await fetch("/api/config")).json();
    const j = await api("/api/admin" + (v ? "?v=" + v : ""));
    today = j.today; if (!day) day = today;
    if (j.changed === false) { if ($("#appView").hidden) show(true), render(); return; }
    detect(j.bookings, silent);
    bookings = j.bookings; v = j.v; show(true); render();
  } catch (e) {
    show(false); $("#loginErr").textContent = KEY ? e.message : "";
  }
}
function detect(list, silent) {
  const map = new Map(list.map(b => [b.id, b.status]));
  if (prev && !silent) {
    for (const b of list) {
      const old = prev.get(b.id);
      if (old === undefined && b.status === "confirmed" && b.source === "web") sysNotify("Nuevo turno", `${b.name} · ${dlabel(b.date)} ${b.time} hs`, "new-" + b.id);
      else if (old && old !== "cancelled" && b.status === "cancelled") sysNotify("Turno cancelado", `${b.name} · ${dlabel(b.date)} ${b.time} hs`, "cancel-" + b.id);
    }
  }
  prev = map;
}

/* ---- helpers de vista ---- */
const active = b => b.status !== "cancelled";
const slotTimes = date => {
  const h = C.hours[dow(date)]; if (!h) return [];
  const out = []; for (let t = toMin(h[0]); t + C.step <= toMin(h[1]); t += C.step) out.push(fromMin(t)); return out;
};
const match = b => !q || (b.name + " " + (b.phone || "")).toLowerCase().includes(q.toLowerCase());

function waLink(b) {
  const tel = (b.phone || "").replace(/\D/g, ""); if (!tel) return "";
  const n = tel.startsWith("54") ? tel : "549" + tel.replace(/^0+/, "").replace(/^15/, "");
  const msg = encodeURIComponent(`Hola ${b.name}! Te escribo de FZ Studio por tu turno del ${dlabel(b.date)} a las ${b.time} hs.`);
  return `<a href="tel:+${esc(n)}">Llamar</a><a href="https://wa.me/${esc(n)}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a>`;
}
function card(b, withDate) {
  const off = b.status === "cancelled" || b.status === "noshow";
  const k = esc(b.k);
  const acts = [];
  acts.push(b.status === "blocked" ? "" : waLink(b));
  if (b.status === "confirmed") acts.push(`<button class="ok" data-a="completed" data-k="${k}">Realizado</button><button class="no" data-a="cancelled" data-k="${k}">Cancelar</button><button data-a="noshow" data-k="${k}">No vino</button><button data-a="move" data-k="${k}">Mover</button>`);
  if (b.status !== "cancelled" && b.status !== "blocked") acts.push(`<button data-a="note" data-k="${k}">Nota</button>`);
  if (b.status === "blocked") acts.push(`<button data-a="del" data-k="${k}">Liberar</button>`);
  else if (b.status !== "confirmed") acts.push(`<button class="no" data-a="del" data-k="${k}">Eliminar</button>`);
  return `<div class="item${off ? " off" : ""}">
    <div class="t">${esc(b.time)}${withDate ? `<small>${esc(b.date.slice(8))}/${esc(b.date.slice(5, 7))}</small>` : ""}</div>
    <div class="m">
      <div class="n">${esc(b.name)}<span class="chip c-${esc(b.status)}">${LABEL[b.status] || esc(b.status)}</span></div>
      <div class="s">${b.status === "blocked" ? "Horario no disponible" : esc(b.serviceName) + " · " + money(b.price) + (b.source === "admin" ? " · manual" : " · web") + (b.phone ? " · " + esc(b.phone) : "")}</div>
      ${b.note ? `<div class="note">📝 ${esc(b.note)}</div>` : ""}
      <div class="acts">${acts.join("")}</div>
    </div></div>`;
}
const group = (list, withDate = true) => {
  let html = "", last = "";
  for (const b of list) {
    if (b.date !== last) { last = b.date; html += `<div class="day">${dlabel(b.date)}${b.date === today ? " · hoy" : ""}</div>`; }
    html += card(b, withDate);
  }
  return html;
};

/* ---- render por pestaña ---- */
function stats() {
  const live = bookings.filter(b => b.status === "confirmed" || b.status === "completed");
  const month = today.slice(0, 7), wk = addDays(today, 6);
  const n1 = live.filter(b => b.date === today).length;
  const n2 = live.filter(b => b.date >= today && b.date <= wk).length;
  const inc = live.filter(b => b.date.startsWith(month)).reduce((a, b) => a + (b.price || 0), 0);
  const canc = bookings.filter(b => b.status === "cancelled" && b.date.startsWith(month)).length;
  return `<div class="stats">
    <div class="stat"><b>${n1}</b><span>Hoy</span></div>
    <div class="stat"><b>${n2}</b><span>Próx. 7 días</span></div>
    <div class="stat"><b>${money(inc)}</b><span>Mes</span></div>
    <div class="stat"><b>${canc}</b><span>Cancel. mes</span></div></div>`;
}

function renderAgenda() {
  const times = slotTimes(day);
  const dayB = bookings.filter(b => b.date === day && active(b));
  const byTime = new Map(dayB.map(b => [b.time, b]));
  let html = stats() + `<div class="dnav"><button data-nav="-1">‹</button><div class="t">${dlabel(day)}${day === today ? " · hoy" : ""}</div><button data-nav="1">›</button></div>
    <div class="dnav"><button data-nav="today">Hoy</button><input type="date" id="pick" value="${day}"></div>`;
  if (!times.length && !dayB.length) html += `<p class="empty">No se atiende este día.</p>`;
  const all = new Set([...times, ...dayB.map(b => b.time)]);
  for (const t of [...all].sort()) {
    const b = byTime.get(t);
    if (b) html += card(b, false);
    else {
      const past = day < today;
      html += `<div class="free"><div class="t">${t}</div><span>Libre</span>${past ? "" : `<button class="btn sm" data-new="${t}">+ Agendar</button>`}</div>`;
    }
  }
  const cx = bookings.filter(b => b.date === day && b.status === "cancelled");
  if (cx.length) html += `<div class="day">Cancelados (${cx.length})</div>` + cx.map(b => card(b, false)).join("");
  return html;
}

function renderList() {
  const segs = [["upcoming", "Próximos"], ["history", "Historial"], ["cancelled", "Cancelados"]];
  let rows;
  if (sub === "upcoming") rows = bookings.filter(b => b.date >= today && (b.status === "confirmed" || b.status === "blocked") && match(b));
  else if (sub === "history") rows = bookings.filter(b => b.date < today && b.status !== "cancelled" && b.status !== "blocked" && match(b)).reverse();
  else rows = bookings.filter(b => b.status === "cancelled" && match(b)).sort((a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0));
  let html = `<div class="seg">${segs.map(([k, l]) => `<button data-sub="${k}" class="${sub === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <input class="search" id="q" placeholder="Buscar por nombre o teléfono" value="${esc(q)}">`;
  if (!rows.length) return html + `<p class="empty">No hay turnos para mostrar.</p>`;
  return html + (sub === "cancelled" ? rows.map(b => card(b, true)).join("") : group(rows));
}

function clientsData() {
  const m = new Map();
  for (const b of bookings) {
    if (b.status === "blocked") continue;
    const key = (b.phone || "").replace(/\D/g, "") || b.name.toLowerCase();
    const c = m.get(key) || { name: b.name, phone: b.phone, done: 0, canc: 0, no: 0, last: "", next: "" };
    if (b.status === "completed" || (b.status === "confirmed" && b.date < today)) c.done++;
    if (b.status === "cancelled") c.canc++;
    if (b.status === "noshow") c.no++;
    if (b.status !== "cancelled" && b.date <= today && b.date > c.last) c.last = b.date;
    if (b.status === "confirmed" && b.date >= today && (!c.next || b.date < c.next)) c.next = b.date;
    m.set(key, c);
  }
  return [...m.values()];
}
function renderClients() {
  const list = clientsData().filter(c => !q || (c.name + " " + (c.phone || "")).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.done - a.done || b.last.localeCompare(a.last));
  let html = `<input class="search" id="q" placeholder="Buscar cliente" value="${esc(q)}"><p class="hint" style="margin:-4px 0 12px">Últimos 90 días · ${list.length} clientes</p>`;
  if (!list.length) return html + `<p class="empty">Todavía no hay clientes.</p>`;
  return html + list.map(c => {
    const tel = (c.phone || "").replace(/\D/g, ""), n = tel.startsWith("54") ? tel : "549" + tel.replace(/^0+/, "").replace(/^15/, "");
    return `<div class="card cli"><div class="n"><b>${esc(c.name)}</b><br><span class="hint">${c.done} visitas${c.canc ? " · " + c.canc + " cancel." : ""}${c.no ? " · " + c.no + " no vino" : ""}${c.last ? " · última " + esc(c.last.slice(8) + "/" + c.last.slice(5, 7)) : ""}${c.next ? " · próximo " + esc(c.next.slice(8) + "/" + c.next.slice(5, 7)) : ""}</span></div>${tel ? `<div class="acts"><a href="https://wa.me/${esc(n)}" target="_blank" rel="noopener">WhatsApp</a></div>` : ""}</div>`;
  }).join("");
}

function renderSettings() {
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  return `<div class="card"><h3>Notificaciones</h3>
    <p>Estado: <b>${perm === "granted" ? "activadas en este dispositivo" : perm === "denied" ? "bloqueadas (habilitalas en la config del navegador)" : perm === "unsupported" ? "no disponible en este navegador" : "desactivadas"}</b>. Recibís un aviso por cada turno nuevo y cada cancelación.</p>
    <button class="btn sm" data-s="push">${perm === "granted" ? "Volver a registrar" : "Activar notificaciones"}</button>
    <button class="btn sm ghost" data-s="test">Enviar prueba</button>
    <p class="hint">En iPhone primero hay que instalar la app (Compartir → Agregar a inicio) y abrirla desde el ícono.</p></div>
    <div class="card"><h3>Datos</h3><p>Exportá los turnos cargados (últimos 90 días y próximos) a una planilla.</p>
    <button class="btn sm" data-s="csv">Descargar CSV</button></div>
    <div class="card"><h3>Web pública</h3><p>Lo que ven tus clientes para reservar.</p><a class="btn sm" href="/" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Abrir web</a></div>
    <div class="card"><h3>Sesión</h3><button class="btn sm ghost" data-s="logout">Cerrar sesión</button></div>`;
}

function animate() { // las animaciones solo corren al cambiar de pestaña/día, no en cada refresco
  const m = $("#main"); m.classList.add("anim"); clearTimeout(animate.h); animate.h = setTimeout(() => m.classList.remove("anim"), 800);
}
function render() {
  const el = $("#main"), keep = document.activeElement && document.activeElement.id === "q";
  el.innerHTML = tab === "agenda" ? renderAgenda() : tab === "list" ? renderList() : tab === "clients" ? renderClients() : renderSettings();
  $("#fab").hidden = tab === "settings";
  if (keep) { const i = $("#q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

/* ---- eventos ---- */
$("#main").addEventListener("click", async e => {
  const t = e.target.closest("button,input"); if (!t) return;
  const d = t.dataset;
  if (d.nav) { day = d.nav === "today" ? today : addDays(day, +d.nav); animate(); return render(); }
  if (d.sub) { sub = d.sub; animate(); return render(); }
  if (d.new) return openModal({ time: d.new });
  if (d.s) return settingsAction(d.s);
  if (d.a) return bookingAction(d.a, d.k);
});
$("#main").addEventListener("input", e => { if (e.target.id === "q") { q = e.target.value; render(); } });
$("#main").addEventListener("change", e => { if (e.target.id === "pick" && e.target.value) { day = e.target.value; render(); } });

async function bookingAction(a, k) {
  const b = bookings.find(x => x.k === k); if (!b) return;
  try {
    if (a === "move") return openModal({ move: b });
    if (a === "note") { const n = prompt("Nota para este turno:", b.note || ""); if (n === null) return; await api("/api/admin", { method: "PATCH", body: JSON.stringify({ k, note: n }) }); }
    else if (a === "del") { if (!confirm(b.status === "blocked" ? "¿Liberar este horario?" : "¿Eliminar definitivamente?")) return; await api("/api/admin?k=" + encodeURIComponent(k), { method: "DELETE" }); }
    else {
      if (a === "cancelled" && !confirm(`¿Cancelar el turno de ${b.name}? El horario queda libre.`)) return;
      if (a === "noshow" && !confirm("¿Marcar que no vino?")) return;
      await api("/api/admin", { method: "PATCH", body: JSON.stringify({ k, status: a }) });
    }
    await load(true);
  } catch (x) { toast(x.message, true); }
}

function settingsAction(s) {
  if (s === "logout") { try { localStorage.removeItem("fz_admin_key"); } catch {} KEY = ""; v = ""; prev = null; $("#pass").value = ""; return show(false); }
  if (s === "push") return enablePush();
  if (s === "test") return api("/api/push", { method: "POST", body: JSON.stringify({ test: true }) }).then(() => toast("Prueba enviada")).catch(e => toast(e.message, true));
  if (s === "csv") {
    const rows = [["Fecha", "Hora", "Nombre", "Teléfono", "Servicio", "Precio", "Estado", "Origen", "Nota"]];
    for (const b of bookings) rows.push([b.date, b.time, b.name, b.phone || "", b.serviceName || "", b.price || 0, LABEL[b.status] || b.status, b.source, b.note || ""]);
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "turnos-fz.csv"; a.click();
  }
}
const urlB64 = s => Uint8Array.from(atob((s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function enablePush() {
  if (!("Notification" in window)) return toast("Este navegador no soporta notificaciones", true);
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { render(); return toast("Permiso denegado", true); }
  try {
    const info = await (await fetch("/api/push")).json();
    if (info.enabled && "PushManager" in window) {
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(info.publicKey) });
      await api("/api/push", { method: "POST", body: JSON.stringify({ subscription: sub }) });
      toast("Notificaciones activadas, incluso con la app cerrada");
    } else toast("Avisos activos mientras la app esté abierta. Para avisos con la app cerrada faltan las claves VAPID en Vercel.");
  } catch (e) { toast("No se pudo activar: " + e.message, true); }
  render();
}

$("#nav").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  tab = b.dataset.t; q = ""; document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("on", x === b));
  animate(); render(); scrollTo(0, 0);
});
$("#fab").addEventListener("click", () => openModal({ time: "" }));
$("#refresh").addEventListener("click", () => load());
$("#loginForm").addEventListener("submit", e => {
  e.preventDefault(); KEY = $("#pass").value; $("#loginErr").textContent = ""; v = ""; prev = null;
  try { localStorage.setItem("fz_admin_key", KEY); } catch {}
  load();
});

/* ---- modal: turno manual / bloqueo / mover ---- */
async function fillTimes() {
  const d = $("#mDate").value; if (!d) return;
  const { slots } = await (await fetch("/api/slots?date=" + d)).json();
  const free = slots.filter(s => s.free);
  $("#mTime").innerHTML = free.length ? free.map(s => `<option${s.time === presetTime ? " selected" : ""}>${s.time}</option>`).join("") : "<option value=''>Sin horarios libres</option>";
}
function setMode(m) {
  mode = m;
  document.querySelectorAll("#kind button").forEach(x => x.classList.toggle("on", x.dataset.k === m));
  $("#mClient").hidden = m !== "book"; $("#mTimeBox").hidden = m === "blockday";
}
async function openModal({ time, move }) {
  if (!C) return;
  editK = move ? move.k : ""; presetTime = time || "";
  $("#kind").hidden = !!move; $("#mTitle").textContent = move ? `Mover turno de ${move.name}` : "Nuevo";
  setMode(move ? "move" : "book"); if (move) { $("#mClient").hidden = true; $("#mTimeBox").hidden = false; }
  const opts = [];
  for (let i = 0; i <= C.daysAhead; i++) { const d = addDays(today, i); if (C.hours[dow(d)]) opts.push(d); }
  $("#mDate").innerHTML = opts.map(d => `<option value="${d}"${d === day ? " selected" : ""}>${dlabel(d)}</option>`).join("");
  $("#mName").value = $("#mPhone").value = $("#mNote").value = ""; $("#mErr").textContent = "";
  $("#modal").hidden = false; await fillTimes();
}
$("#mDate").addEventListener("change", () => { presetTime = ""; fillTimes(); });
$("#kind").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.k); });
$("#mCancel").addEventListener("click", () => { $("#modal").hidden = true; });
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").hidden = true; });
$("#mSave").addEventListener("click", async () => {
  $("#mErr").textContent = "";
  const date = $("#mDate").value, time = $("#mTime").value;
  if (mode !== "blockday" && !time) return ($("#mErr").textContent = "Elegí un horario libre.");
  let body;
  if (mode === "move") body = { action: "move", k: editK, date, time };
  else if (mode === "block") body = { action: "block", date, time };
  else if (mode === "blockday") { if (!confirm("¿Bloquear todos los horarios libres de ese día?")) return; body = { action: "blockday", date }; }
  else body = { date, time, name: $("#mName").value, phone: $("#mPhone").value, note: $("#mNote").value };
  try {
    await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
    $("#modal").hidden = true; if (date) day = date; await load(true);
  } catch (x) { $("#mErr").textContent = x.message; }
});

/* ---- actualización automática ahorrando comandos: 1 consulta por minuto, solo con la app visible ---- */
setInterval(() => { if (!document.hidden && KEY && !$("#appView").hidden) load(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && KEY && !$("#appView").hidden) load(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
KEY ? load() : show(false);
