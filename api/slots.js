const { r, slotsFor, isPast, monthKey, slotField, handler } = require("./_lib");

module.exports = handler(async (req, res) => {
  const date = String(req.query.date || "");
  const times = slotsFor(date);
  if (!times.length) return res.json({ slots: [] });
  const taken = await r(["HMGET", monthKey(date), ...times.map(t => slotField(date, t))]); // 1 comando
  res.json({ slots: times.map((time, i) => ({ time, free: !taken[i] && !isPast(date, time) })) });
});
