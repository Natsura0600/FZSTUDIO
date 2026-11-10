const { CONFIG, arNow, handler } = require("./_lib");

module.exports = handler(async (req, res) => {
  res.json({ ...CONFIG, today: arNow().date });
});
