const $ = s => document.querySelector(s);
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const money = n => "$" + n.toLocaleString("es-AR");
const state = { service: null, date: null, time: null };
let C;

const dparts = iso => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const label = iso => { const p = dparts(iso); return `${DAYS[p.dow]} ${p.d} de ${MONTHS[p.m - 1]}`; };

async function api(url, opts) {
  const res = await fetch(url, opts);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || "Error"), { status: res.status });
  return j;
}

async function init() {
  try { C = await api("/api/config"); }
  catch { $("#err").textContent = "No se pudo cargar la agenda. Probá recargar."; return; }
  state.service = C.services[0];

  $("#serviceCards").innerHTML = C.services.map(s =>
    `<div class="card"><h3>${s.name}</h3><p>${s.desc}</p><span class="price">${money(s.price)}</span><span class="dur">${s.min >= 60 ? s.min / 60 + " h" : s.min + " min"}</span></div>`).join("");

  if (C.services.length > 1) {
    $("#svcStep").hidden = false;
    $("#serviceChips").innerHTML = C.services.map((s, i) =>
      `<button type="button" class="chip${i === 0 ? " on" : ""}" data-id="${s.id}">${s.name}<small>${money(s.price)}</small></button>`).join("");
  }

  // días disponibles
  const base = new Date(C.today + "T00:00:00Z"), days = [];
  for (let i = 0; i <= C.daysAhead; i++) {
    const d = new Date(base.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10);
    if (C.hours[d.getUTCDay()]) days.push(iso);
  }
  $("#dayChips").innerHTML = days.map(iso => {
    const p = dparts(iso);
    return `<button type="button" class="chip" data-d="${iso}">${DAYS[p.dow]}<b>${p.d}</b><small>${MONTHS[p.m - 1]}</small></button>`;
  }).join("");

  const order = [1, 2, 3, 4, 5, 6, 0], full = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  $("#hoursList").innerHTML = order.map(i => {
    const h = C.hours[i];
    return `<li><span>${full[i]}</span><span>${h ? h[0] + " – " + h[1] : "Cerrado"}</span></li>`;
  }).join("");
  $("#addr").textContent = C.city + " · " + C.phoneDisplay;
  const wa = `https://wa.me/${C.phone}?text=${encodeURIComponent("Hola! Quería consultar por un turno.")}`;
  $("#waLink").href = wa; $("#waFloat").href = wa;
  $("#mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(C.mapsQuery);
  $("#igLink").href = "https://instagram.com/" + C.instagram;
  $("#igLink").textContent = "@" + C.instagram;
}

async function loadSlots() {
  const box = $("#slotChips");
  if (!state.date) { box.innerHTML = '<span class="hint">Elegí primero un día</span>'; return; }
  box.innerHTML = '<span class="hint">Cargando…</span>';
  try {
    const { slots } = await api("/api/slots?date=" + state.date);
    if (!slots.some(s => s.free)) { box.innerHTML = '<span class="hint">No quedan horarios este día. Probá con otro.</span>'; return; }
    box.innerHTML = slots.map(s => `<button type="button" class="chip${state.time === s.time ? " on" : ""}" data-t="${s.time}" ${s.free ? "" : "disabled"}>${s.time}</button>`).join("");
  } catch { box.innerHTML = '<span class="hint">No se pudieron cargar los horarios.</span>'; }
}

function renderSummary() {
  const s = $("#summary");
  if (!state.date || !state.time) { s.textContent = "Completá los pasos para ver el resumen."; return; }
  s.innerHTML = `<b>${state.service.name}</b><br>${label(state.date)} a las <b>${state.time} hs</b> · ${money(state.service.price)}`;
}

function pick(sel, btn) { document.querySelectorAll(sel + " .chip").forEach(c => c.classList.remove("on")); btn.classList.add("on"); }

$("#serviceChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  pick("#serviceChips", b); state.service = C.services.find(s => s.id === b.dataset.id); renderSummary();
});
$("#dayChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  pick("#dayChips", b); state.date = b.dataset.d; state.time = null; renderSummary(); loadSlots();
});
$("#slotChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b || b.disabled) return;
  pick("#slotChips", b); state.time = b.dataset.t; renderSummary();
});

$("#booking").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#err"); err.textContent = "";
  if (!state.date) return (err.textContent = "Elegí un día.");
  if (!state.time) return (err.textContent = "Elegí un horario.");
  const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "Reservando…";
  try {
    const name = $("#name").value.trim(), phone = $("#phone").value.trim();
    await api("/api/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, date: state.date, time: state.time, service: state.service.id, website: $("#website").value })
    });
    $("#booking").hidden = true; $("#done").hidden = false;
    $("#doneText").textContent = `${name}, te esperamos el ${label(state.date)} a las ${state.time} hs en FZ Studio.`;
    const msg = `Hola! Reservé un turno en FZ Studio: ${state.service.name}, ${label(state.date)} ${state.time} hs. Nombre: ${name}.`;
    $("#doneWa").href = `https://wa.me/${C.phone}?text=${encodeURIComponent(msg)}`;
    $("#done").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (x) {
    err.textContent = x.message;
    if (x.status === 409) { state.time = null; renderSummary(); loadSlots(); }
  } finally { btn.disabled = false; btn.textContent = "Confirmar turno"; }
});
$("#again").addEventListener("click", () => {
  $("#done").hidden = true; $("#booking").hidden = false;
  state.date = state.time = null; $("#booking").reset();
  document.querySelectorAll("#dayChips .chip").forEach(c => c.classList.remove("on"));
  renderSummary(); loadSlots();
});

$("#year").textContent = new Date().getFullYear();
const nav = $("#nav"), onScroll = () => nav.classList.toggle("solid", scrollY > 40);
addEventListener("scroll", onScroll); onScroll();
init();
