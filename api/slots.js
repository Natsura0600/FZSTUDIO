const { r, slotsFor, isPast, lockKey, handler } = require("./_lib");

module.exports = handler(async (req, res) => {
  const date = String(req.query.date || "");
  const times = slotsFor(date);
  if (!times.length) return res.json({ slots: [] });
  const locks = await r(["MGET", ...times.map(t => lockKey(date, t))]);
  res.json({
    slots: times.map((time, i) => ({ time, free: !locks[i] && !isPast(date, time) }))
  });
});
