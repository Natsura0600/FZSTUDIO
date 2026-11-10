const $ = s => document.querySelector(s);
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAYSF = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TZ = "America/Argentina/Buenos_Aires";
const money = n => "$" + n.toLocaleString("es-AR");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { service: null, date: null, time: null };
let C, slotReq = 0;

const dparts = iso => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const label = iso => { const p = dparts(iso); return `${DAYS[p.dow]} ${p.d} de ${MONTHS[p.m - 1]}`; };
const arNow = () => {
  const d = new Date();
  return { date: d.toLocaleDateString("en-CA", { timeZone: TZ }), time: d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) };
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || "Ocurrió un error, probá de nuevo"), { status: res.status });
  return j;
}

/* ---------- animaciones de entrada ---------- */
const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el); el.classList.add("in");
    if (el.dataset.count) countUp(el);
    setTimeout(() => el.classList.remove("rv", "in"), 1800); // libera el transform para los hover
  });
}, { threshold: .12, rootMargin: "0px 0px -6% 0px" }) : null;
function reveal(root = document) {
  root.querySelectorAll(".rv:not([data-obs])").forEach(el => {
    el.dataset.obs = 1;
    if (io) io.observe(el); else el.classList.add("in");
  });
}
function countUp(el) {
  const target = +el.dataset.count; if (reduced) return;
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / 1000), v = Math.round(target * (1 - Math.pow(1 - p, 3)));
    el.textContent = money(v); if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- estado abierto/cerrado ---------- */
function renderStatus() {
  const n = arNow(), dow = dparts(n.date).dow, h = C.hours[dow];
  const box = $("#status"), txt = box.querySelector("span");
  let open = false, msg = "";
  if (h && n.time >= h[0] && n.time < h[1]) { open = true; msg = `Abierto ahora · hasta las ${h[1]}`; }
  else if (h && n.time < h[0]) msg = `Hoy abrimos a las ${h[0]}`;
  else {
    for (let i = 1; i <= 7; i++) {
      const d = (dow + i) % 7;
      if (C.hours[d]) { msg = `Cerrado · abrimos ${i === 1 ? "mañana" : "el " + DAYSF[d].toLowerCase()} a las ${C.hours[d][0]}`; break; }
    }
  }
  txt.textContent = msg; box.classList.toggle("open", open); box.hidden = !msg;
}

async function init() {
  try { C = await api("/api/config"); }
  catch {
    $("#dayChips").innerHTML = '<span class="hint">No se pudo cargar la agenda. <a href="" style="text-decoration:underline">Reintentar</a></span>';
    return;
  }
  state.service = C.services[0];

  $("#serviceCards").innerHTML = C.services.map((s, i) =>
    `<div class="card rv" style="--d:${i * .1}s"><h3>${s.name}</h3><p>${s.desc}</p><span class="price" data-count="${s.price}">${money(s.price)}</span><span class="dur">${s.min >= 60 ? s.min / 60 + " h" : s.min + " min"}</span></div>`).join("");

  if (C.services.length > 1) {
    $("#svcStep").hidden = false;
    $("#serviceChips").innerHTML = C.services.map((s, i) =>
      `<button type="button" class="chip${i === 0 ? " on" : ""}" style="--i:${i}" data-id="${s.id}">${s.name}<small>${money(s.price)}</small></button>`).join("");
  }

  // días disponibles (hoy incluido solo si todavía quedan horarios)
  const now = arNow(), base = new Date(now.date + "T00:00:00Z"), days = [];
  for (let i = 0; i <= C.daysAhead; i++) {
    const d = new Date(base.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10), h = C.hours[d.getUTCDay()];
    if (!h) continue;
    if (i === 0 && now.time >= h[1]) continue;
    days.push(iso);
  }
  $("#dayChips").innerHTML = days.length ? days.map((iso, i) => {
    const p = dparts(iso);
    return `<button type="button" class="chip" style="--i:${i}" data-d="${iso}">${DAYS[p.dow]}<b>${p.d}</b><small>${MONTHS[p.m - 1]}</small></button>`;
  }).join("") : '<span class="hint">No hay días disponibles por ahora.</span>';

  const order = [1, 2, 3, 4, 5, 6, 0], dowNow = dparts(now.date).dow;
  $("#hoursList").innerHTML = order.map(i => {
    const h = C.hours[i];
    return `<li class="${i === dowNow ? "today" : ""}"><span>${DAYSF[i]}</span><span>${h ? h[0] + " – " + h[1] : "Cerrado"}</span></li>`;
  }).join("");
  $("#addr").textContent = C.city + " · " + C.phoneDisplay;
  const wa = `https://wa.me/${C.phone}?text=${encodeURIComponent("Hola! Quería consultar por un turno.")}`;
  $("#waLink").href = wa; $("#waFloat").href = wa;
  $("#mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(C.mapsQuery);
  $("#igLink").href = "https://instagram.com/" + C.instagram;
  $("#igLink").textContent = "@" + C.instagram;
  renderStatus(); setInterval(renderStatus, 60000);
  reveal();
}

async function loadSlots() {
  const box = $("#slotChips"), my = ++slotReq;
  if (!state.date) { box.innerHTML = '<span class="hint">Elegí primero un día</span>'; return; }
  box.innerHTML = '<span class="skel"></span> <span class="skel"></span> <span class="skel"></span>';
  try {
    const { slots } = await api("/api/slots?date=" + state.date);
    if (my !== slotReq) return; // llegó una respuesta vieja
    if (!slots.some(s => s.free)) { box.innerHTML = '<span class="hint">No quedan horarios este día. Probá con otro.</span>'; return; }
    box.innerHTML = slots.map((s, i) => `<button type="button" class="chip${state.time === s.time ? " on" : ""}" style="--i:${i}" data-t="${s.time}" ${s.free ? "" : "disabled"}>${s.time}</button>`).join("");
  } catch { if (my === slotReq) box.innerHTML = '<span class="hint">No se pudieron cargar los horarios. Probá de nuevo.</span>'; }
}

function renderSummary() {
  const s = $("#summary"), ok = state.date && state.time;
  s.classList.toggle("ready", !!ok);
  if (!ok) { s.textContent = "Completá los pasos para ver el resumen."; return; }
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
  const fail = m => { err.textContent = ""; void err.offsetWidth; err.textContent = m; };
  const name = $("#name").value.trim(), phone = $("#phone").value.trim();
  if (!state.date) return fail("Elegí un día.");
  if (!state.time) return fail("Elegí un horario.");
  if (name.length < 2) { $("#name").focus(); return fail("Ingresá tu nombre."); }
  if (phone.replace(/\D/g, "").length < 8) { $("#phone").focus(); return fail("Ingresá un teléfono válido."); }
  const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "Reservando…";
  try {
    const resp = await api("/api/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, date: state.date, time: state.time, service: state.service.id, website: $("#website").value })
    });
    $("#booking").hidden = true; $("#done").hidden = false;
    const cl = location.origin + "/cancelar?t=" + resp.token;
    $("#cancelLink").href = cl; $("#cancelLink").textContent = "Cancelar mi turno";
    $("#doneText").textContent = `${name}, te esperamos el ${label(state.date)} a las ${state.time} hs en FZ Studio.`;
    const msg = `Hola! Reservé un turno en FZ Studio: ${state.service.name}, ${label(state.date)} ${state.time} hs. Nombre: ${name}.`;
    $("#doneWa").href = `https://wa.me/${C.phone}?text=${encodeURIComponent(msg)}`;
    $("#done").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  } catch (x) {
    fail(x.message);
    if (x.status === 409) { state.time = null; renderSummary(); loadSlots(); }
  } finally { btn.disabled = false; btn.textContent = "Confirmar turno"; }
});
$("#again").addEventListener("click", () => {
  $("#done").hidden = true; $("#booking").hidden = false;
  state.date = state.time = null; $("#booking").reset();
  document.querySelectorAll("#dayChips .chip").forEach(c => c.classList.remove("on"));
  renderSummary(); loadSlots();
  $("#turnos").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
});

/* ---------- menú, scroll, parallax ---------- */
const nav = $("#nav"), burger = $("#burger"), heroBg = $("#heroBg"), bar = $("#progress");
function setMenu(open) {
  nav.classList.toggle("open", open); burger.setAttribute("aria-expanded", open);
  burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú"); onScroll();
}
burger.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
$("#menu").addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
document.addEventListener("click", e => { if (nav.classList.contains("open") && !e.target.closest("#nav")) setMenu(false); });

let ticking = false;
function onScroll() {
  nav.classList.toggle("solid", scrollY > 40 || nav.classList.contains("open"));
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.width = (max > 0 ? Math.min(100, scrollY / max * 100) : 0) + "%";
  if (!reduced && scrollY < innerHeight * 1.2) heroBg.style.transform = `translate3d(0,${scrollY * .22}px,0)`;
}
addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { onScroll(); ticking = false; }); } }, { passive: true });
onScroll();

$("#year").textContent = new Date().getFullYear();
reveal();
init();
