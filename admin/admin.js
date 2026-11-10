const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + (n || 0).toLocaleString("es-AR");
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LABEL = { confirmed: "Confirmado", completed: "Realizado", cancelled: "Cancelado", noshow: "No vino", blocked: "Bloqueado" };
let KEY = ""; try { KEY = localStorage.getItem("fz_admin_key") || ""; } catch {}
let bookings = [], view = "today", C = null, kind = "book", today = "";

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", "x-admin-key": KEY, ...(opts.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || "Error"), { status: res.status });
  return j;
}
const dlabel = iso => { const [y, m, d] = iso.split("-").map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MONTHS[m - 1]}`; };

function show(logged) { $("#loginView").hidden = logged; $("#appView").hidden = !logged; }

async function load() {
  try {
    if (!C) { C = await (await fetch("/api/config")).json(); today = C.today; }
    const { bookings: b } = await api("/api/admin");
    bookings = b; show(true); render();
  } catch (e) {
    if (e.status === 401 || !KEY) { show(false); if (KEY) $("#loginErr").textContent = e.message; }
    else { show(false); $("#loginErr").textContent = e.message; }
  }
}

function render() {
  const live = bookings.filter(b => b.status !== "cancelled" && b.status !== "blocked");
  const month = today.slice(0, 7);
  $("#sToday").textContent = live.filter(b => b.date === today && b.status !== "noshow").length;
  $("#sNext").textContent = live.filter(b => b.date > today).length;
  $("#sMoney").textContent = money(live.filter(b => b.date.startsWith(month) && b.status !== "noshow").reduce((a, b) => a + (b.price || 0), 0));

  let rows;
  if (view === "today") rows = bookings.filter(b => b.date === today);
  else if (view === "next") rows = bookings.filter(b => b.date > today);
  else rows = bookings.filter(b => b.date < today).reverse();

  if (!rows.length) { $("#list").innerHTML = `<p class="empty">${view === "today" ? "No hay turnos para hoy." : view === "next" ? "No hay turnos próximos." : "Sin historial todavía."}</p>`; return; }
  let html = "", last = "";
  for (const b of rows) {
    if (b.date !== last) { last = b.date; html += `<div class="day">${dlabel(b.date)}${b.date === today ? " · hoy" : ""}</div>`; }
    const off = b.status === "cancelled" || b.status === "noshow";
    const tel = (b.phone || "").replace(/[^\d]/g, "");
    const waNum = tel.startsWith("54") ? tel : "549" + tel.replace(/^0+/, "").replace(/^15/, "");
    const waMsg = encodeURIComponent(`Hola ${b.name}! Te escribo de FZ Studio por tu turno del ${dlabel(b.date)} a las ${b.time} hs.`);
    html += `<div class="item${off ? " off" : ""}">
      <div class="t">${esc(b.time)}</div>
      <div class="m">
        <div class="n">${esc(b.name)}<span class="chip c-${esc(b.status)}">${LABEL[b.status] || esc(b.status)}</span></div>
        <div class="s">${b.status === "blocked" ? "Horario no disponible" : esc(b.serviceName) + " · " + money(b.price) + (b.source === "admin" ? " · cargado a mano" : " · web")}</div>
        <div class="acts">
          ${tel ? `<a href="tel:+${esc(tel)}">Llamar</a><a href="https://wa.me/${esc(waNum)}?text=${waMsg}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          ${b.status === "confirmed" ? `<button class="ok" data-a="completed" data-id="${esc(b.id)}">Realizado</button><button class="no" data-a="cancelled" data-id="${esc(b.id)}">Cancelar</button><button data-a="noshow" data-id="${esc(b.id)}">No vino</button>` : ""}
          ${b.status === "blocked" ? `<button data-a="del" data-id="${esc(b.id)}">Liberar</button>` : ""}
          ${b.status === "cancelled" || b.status === "completed" || b.status === "noshow" ? `<button data-a="del" data-id="${esc(b.id)}">Eliminar</button>` : ""}
        </div>
      </div></div>`;
  }
  $("#list").innerHTML = html;
}

$("#list").addEventListener("click", async e => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const { a, id } = b.dataset;
  try {
    if (a === "del") { if (!confirm("¿Eliminar definitivamente?")) return; await api("/api/admin?id=" + encodeURIComponent(id), { method: "DELETE" }); }
    else { if (a === "cancelled" && !confirm("¿Cancelar este turno? El horario queda libre.")) return; await api("/api/admin", { method: "PATCH", body: JSON.stringify({ id, status: a }) }); }
    await load();
  } catch (x) { alert(x.message); }
});

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("on")); t.classList.add("on"); view = t.dataset.v; render();
}));

$("#loginForm").addEventListener("submit", e => {
  e.preventDefault(); KEY = $("#pass").value; $("#loginErr").textContent = "";
  try { localStorage.setItem("fz_admin_key", KEY); } catch {}
  load();
});
$("#logout").addEventListener("click", () => { try { localStorage.removeItem("fz_admin_key"); } catch {} KEY = ""; $("#pass").value = ""; show(false); });
$("#refresh").addEventListener("click", load);

/* ---- modal turno manual / bloqueo ---- */
async function fillTimes() {
  const d = $("#mDate").value;
  const { slots } = await (await fetch("/api/slots?date=" + d)).json();
  const free = slots.filter(s => s.free);
  $("#mTime").innerHTML = free.length ? free.map(s => `<option>${s.time}</option>`).join("") : "<option value=''>Sin horarios libres</option>";
}
$("#fab").addEventListener("click", async () => {
  if (!C) return;
  const base = new Date(today + "T00:00:00Z"), opts = [];
  for (let i = 0; i <= C.daysAhead; i++) {
    const d = new Date(base.getTime() + i * 864e5);
    if (C.hours[d.getUTCDay()]) opts.push(d.toISOString().slice(0, 10));
  }
  $("#mDate").innerHTML = opts.map(d => `<option value="${d}">${dlabel(d)}</option>`).join("");
  $("#mName").value = $("#mPhone").value = ""; $("#mErr").textContent = "";
  $("#modal").hidden = false; await fillTimes();
});
$("#mDate").addEventListener("change", fillTimes);
$("#kind").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  kind = b.dataset.k; document.querySelectorAll("#kind button").forEach(x => x.classList.toggle("on", x === b));
  $("#mClient").hidden = kind === "block";
});
$("#mCancel").addEventListener("click", () => { $("#modal").hidden = true; });
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").hidden = true; });
$("#mSave").addEventListener("click", async () => {
  $("#mErr").textContent = "";
  const date = $("#mDate").value, time = $("#mTime").value;
  if (!time) return ($("#mErr").textContent = "Elegí un horario libre.");
  try {
    const body = kind === "block" ? { action: "block", date, time } : { date, time, name: $("#mName").value, phone: $("#mPhone").value };
    await api("/api/admin", { method: "POST", body: JSON.stringify(body) });
    $("#modal").hidden = true; await load();
  } catch (x) { $("#mErr").textContent = x.message; }
});

setInterval(() => { if (!document.hidden && KEY && !$("#appView").hidden) load(); }, 30000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
KEY ? load() : show(false);
