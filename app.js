/* ============================================================
   CONFIGURACIÓN — editá solo esta sección para personalizar
   ============================================================ */
const CONFIG = {
  whatsapp: "5492323000000",            // número con código país, sin + ni espacios
  instagram: "fzstudiobarber",          // usuario de Instagram
  address: "Dirección de la barbería, Luján, Buenos Aires",
  mapsQuery: "FZ Studio Barber Luján Buenos Aires",
  daysAhead: 14,                        // cuántos días mostrar para reservar
  slotMinutes: 30,                      // duración de cada turno
  // horario por día de la semana (0=Dom ... 6=Sáb). null = cerrado
  hours: {
    0: null,
    1: ["10:00", "20:00"],
    2: ["10:00", "20:00"],
    3: ["10:00", "20:00"],
    4: ["10:00", "20:00"],
    5: ["10:00", "20:00"],
    6: ["10:00", "18:00"]
  },
  services: [
    { id: "corte",  name: "Corte de pelo",   desc: "Clásico o moderno, a tu estilo.",     price: 8000,  min: 30 },
    { id: "barba",  name: "Barba",           desc: "Perfilado y toalla caliente.",        price: 5000,  min: 30 },
    { id: "combo",  name: "Corte + Barba",   desc: "El combo completo.",                  price: 12000, min: 60 },
    { id: "fade",   name: "Fade / Degradé",  desc: "Degradé prolijo con terminación.",    price: 9000,  min: 45 },
    { id: "perfil", name: "Perfilado",       desc: "Líneas y contornos al detalle.",      price: 3000,  min: 30 },
    { id: "color",  name: "Color / Mechas",  desc: "Platinado, mechas y color.",          price: 20000, min: 90 }
  ],
  barbers: ["Cualquiera", "FZ"]          // agregá más nombres si hay otros barberos
};
/* ============================================================ */

const $ = s => document.querySelector(s);
const money = n => "$" + n.toLocaleString("es-AR");
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const state = { service: null, barber: CONFIG.barbers[0], date: null, time: null };

/* Turnos ya reservados desde este dispositivo (evita duplicar) */
const store = {
  get() { try { return JSON.parse(localStorage.getItem("fz_bookings") || "[]"); } catch { return []; } },
  add(b) { try { localStorage.setItem("fz_bookings", JSON.stringify([...this.get(), b])); } catch {} }
};

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function fromMin(m) { return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }

/* ---------- Servicios ---------- */
$("#serviceCards").innerHTML = CONFIG.services.map(s => `
  <div class="card"><h3>${s.name}</h3><p>${s.desc}</p>
  <span class="price">${money(s.price)}</span><span class="dur">${s.min} min</span></div>`).join("");

$("#serviceChips").innerHTML = CONFIG.services.map(s =>
  `<button type="button" class="chip" data-id="${s.id}">${s.name}<small>${money(s.price)} · ${s.min} min</small></button>`).join("");
$("#barberChips").innerHTML = CONFIG.barbers.map((b, i) =>
  `<button type="button" class="chip${i === 0 ? " on" : ""}" data-b="${b}">${b}</button>`).join("");

/* ---------- Días ---------- */
const days = [];
const today = new Date(); today.setHours(0, 0, 0, 0);
for (let i = 0; i < CONFIG.daysAhead; i++) {
  const d = new Date(today); d.setDate(today.getDate() + i);
  if (CONFIG.hours[d.getDay()]) days.push(d);
}
$("#dayChips").innerHTML = days.map(d =>
  `<button type="button" class="chip" data-d="${iso(d)}">${DAYS[d.getDay()]}<b>${d.getDate()}</b><small>${MONTHS[d.getMonth()]}</small></button>`).join("");

/* ---------- Horarios ---------- */
function renderSlots() {
  const box = $("#slotChips");
  if (!state.date) { box.innerHTML = '<span class="hint">Elegí primero un día</span>'; return; }
  const [y, m, d] = state.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const [open, close] = CONFIG.hours[dt.getDay()];
  const dur = state.service ? state.service.min : CONFIG.slotMinutes;
  const now = new Date();
  const taken = store.get().filter(b => b.date === state.date && (b.barber === state.barber || b.barber === "Cualquiera" || state.barber === "Cualquiera"));
  const out = [];
  for (let t = toMin(open); t + dur <= toMin(close); t += CONFIG.slotMinutes) {
    const past = iso(now) === state.date && t <= now.getHours() * 60 + now.getMinutes();
    const busy = taken.some(b => t < b.start + b.dur && t + dur > b.start);
    out.push(`<button type="button" class="chip${state.time === fromMin(t) ? " on" : ""}" data-t="${fromMin(t)}" ${past || busy ? "disabled" : ""}>${fromMin(t)}</button>`);
  }
  box.innerHTML = out.length ? out.join("") : '<span class="hint">Sin horarios disponibles</span>';
}

function renderSummary() {
  const s = $("#summary");
  if (!state.service || !state.date || !state.time) { s.innerHTML = "Completá los pasos para ver el resumen."; return; }
  const [y, m, d] = state.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  s.innerHTML = `<b>${state.service.name}</b> con <b>${state.barber}</b><br>${DAYS[dt.getDay()]} ${d} de ${MONTHS[m - 1]} a las <b>${state.time} hs</b> · ${money(state.service.price)}`;
}

/* ---------- Eventos ---------- */
function pick(containerSel, btn, cb) {
  document.querySelectorAll(containerSel + " .chip").forEach(c => c.classList.remove("on"));
  btn.classList.add("on"); cb();
}
$("#serviceChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  pick("#serviceChips", b, () => { state.service = CONFIG.services.find(s => s.id === b.dataset.id); state.time = null; renderSlots(); renderSummary(); });
});
$("#barberChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  pick("#barberChips", b, () => { state.barber = b.dataset.b; state.time = null; renderSlots(); renderSummary(); });
});
$("#dayChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  pick("#dayChips", b, () => { state.date = b.dataset.d; state.time = null; renderSlots(); renderSummary(); });
});
$("#slotChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b || b.disabled) return;
  state.time = b.dataset.t; renderSlots(); renderSummary();
});

$("#booking").addEventListener("submit", e => {
  e.preventDefault();
  if (!state.service) return alert("Elegí un servicio.");
  if (!state.date) return alert("Elegí un día.");
  if (!state.time) return alert("Elegí un horario.");
  const name = $("#name").value.trim(), phone = $("#phone").value.trim();
  if (!name || !phone) return alert("Completá tu nombre y teléfono.");
  const [y, m, d] = state.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const msg =
`Hola! Quiero reservar un turno en FZ Studio Barber:
• Servicio: ${state.service.name} (${money(state.service.price)})
• Barbero: ${state.barber}
• Día: ${DAYS[dt.getDay()]} ${d}/${m}
• Hora: ${state.time} hs
• Nombre: ${name}
• Teléfono: ${phone}`;
  store.add({ date: state.date, start: toMin(state.time), dur: state.service.min, barber: state.barber });
  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
  renderSlots();
});

/* ---------- Contacto / horarios ---------- */
const order = [1, 2, 3, 4, 5, 6, 0], full = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
$("#hoursList").innerHTML = order.map(i => {
  const h = CONFIG.hours[i];
  return `<li><span>${full[i]}</span><span>${h ? h[0] + " – " + h[1] : "Cerrado"}</span></li>`;
}).join("");
$("#addr").textContent = CONFIG.address;
const wa = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent("Hola! Quería consultar por un turno.")}`;
$("#waLink").href = wa; $("#waFloat").href = wa;
$("#mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(CONFIG.mapsQuery);
$("#igLink").href = "https://instagram.com/" + CONFIG.instagram;
$("#igLink").textContent = "@" + CONFIG.instagram;
$("#year").textContent = new Date().getFullYear();

const nav = $("#nav");
const onScroll = () => nav.classList.toggle("solid", scrollY > 40);
addEventListener("scroll", onScroll); onScroll();
