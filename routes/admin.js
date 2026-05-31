/**
 * routes/admin.js  –  Protected admin API
 */
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { getDB } = require('../database');
const { authenticateAdmin, generateToken } = require('../middleware/auth');

function getISTDate(offsetDays = 0) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}
function getISTDateTime() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().replace('T',' ').slice(0,19);
}

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = getDB().prepare('SELECT * FROM admin_users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = generateToken({ id: user.id, username: user.username });
  res.json({ token, username: user.username });
});

// ── All routes below require JWT ──────────────────────────────────────
router.use(authenticateAdmin);

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  const today = getISTDate();
  const yesterday = getISTDate(-1);
  const games = getDB().prepare(`
    SELECT g.*, r.id AS result_id, r.result_number, r.declared_at,
           y.result_number AS yesterday_number
    FROM games g
    LEFT JOIN results r  ON r.game_id=g.id AND r.result_date=?
    LEFT JOIN results y  ON y.game_id=g.id AND y.result_date=?
    WHERE g.is_active=1 ORDER BY g.sort_order
  `).all(today, yesterday);
  res.json({ date: today, games });
});

// POST /api/admin/declare-result
router.post('/declare-result', (req, res) => {
  const { game_id, result_number, result_date } = req.body;
  if (game_id == null || result_number == null)
    return res.status(400).json({ error: 'game_id and result_number required' });
  const num = parseInt(result_number, 10);
  if (isNaN(num) || num < 0 || num > 99)
    return res.status(400).json({ error: 'Result must be 00–99' });
  const db = getDB();
  const game = db.prepare('SELECT * FROM games WHERE id=?').get(game_id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const date = result_date || getISTDate();
  const now  = getISTDateTime();
  try {
    db.prepare(`
      INSERT INTO results (game_id, result_number, result_date, declared_at, declared_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(game_id, result_date) DO UPDATE SET
        result_number=excluded.result_number,
        declared_at=excluded.declared_at,
        declared_by=excluded.declared_by
    `).run(game_id, num, date, now, req.admin.username);
    const payload = {
      game_id, game_name: game.name, schedule_time: game.schedule_time,
      result_number: num, result_date: date, declared_at: now
    };
    req.app.get('io').emit('new-result', payload);
    res.json({ success: true, result: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/admin/result/:id
router.put('/result/:id', (req, res) => {
  const num = parseInt(req.body.result_number, 10);
  if (isNaN(num) || num < 0 || num > 99) return res.status(400).json({ error: 'Result must be 00–99' });
  const db = getDB();
  const row = db.prepare('SELECT r.*, g.name AS game_name, g.schedule_time FROM results r JOIN games g ON r.game_id=g.id WHERE r.id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE results SET result_number=?, declared_at=?, declared_by=? WHERE id=?')
    .run(num, getISTDateTime(), req.admin.username, req.params.id);
  req.app.get('io').emit('new-result', {
    game_id: row.game_id, game_name: row.game_name, schedule_time: row.schedule_time,
    result_number: num, result_date: row.result_date, declared_at: getISTDateTime()
  });
  res.json({ success: true });
});

// DELETE /api/admin/result/:id
router.delete('/result/:id', (req, res) => {
  const info = getDB().prepare('DELETE FROM results WHERE id=?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  req.app.get('io').emit('result-deleted', { id: Number(req.params.id) });
  res.json({ success: true });
});

// GET /api/admin/history?date=YYYY-MM-DD
router.get('/history', (req, res) => {
  const date = req.query.date || getISTDate();
  const rows = getDB().prepare(`
    SELECT r.*, g.name AS game_name, g.schedule_time FROM results r
    JOIN games g ON r.game_id=g.id WHERE r.result_date=?
    ORDER BY r.declared_at
  `).all(date);
  res.json(rows);
});

// POST /api/admin/change-password
router.post('/change-password', (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const db = getDB();
  const user = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.admin.id);
  if (!bcrypt.compareSync(old_password, user.password_hash))
    return res.status(401).json({ error: 'Old password incorrect' });
  db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(new_password, 12), req.admin.id);
  res.json({ success: true });
});

module.exports = router;
