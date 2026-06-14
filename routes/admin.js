/**
 * routes/admin.js  –  Protected admin API
 *
 * NEW FEATURES:
 *  - Declare/edit a result for ANY date (not just today)
 *  - Set a CUSTOM declared time (defaults to now if omitted)
 *  - Edit any existing result regardless of age
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

/**
 * Build a "YYYY-MM-DD HH:MM:SS" string from a date + a "HH:MM" time.
 * Validates both. Returns null if invalid.
 */
function buildDeclaredAt(dateStr, timeStr) {
  // dateStr: "2026-06-01", timeStr: "14:35" (24h) or "" 
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (timeStr) {
    if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (h > 23 || m > 59) return null;
    return `${dateStr} ${timeStr}:00`;
  }
  // No custom time → use current IST time but keep the chosen date
  const nowTime = getISTDateTime().slice(11); // "HH:MM:SS"
  return `${dateStr} ${nowTime}`;
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

// GET /api/admin/dashboard?date=YYYY-MM-DD  (date optional, defaults today)
router.get('/dashboard', (req, res) => {
  const date      = req.query.date || getISTDate();
  const yesterday = getISTDate(-1);
  const games = getDB().prepare(`
    SELECT g.*, r.id AS result_id, r.result_number, r.declared_at,
           y.result_number AS yesterday_number
    FROM games g
    LEFT JOIN results r  ON r.game_id=g.id AND r.result_date=?
    LEFT JOIN results y  ON y.game_id=g.id AND y.result_date=?
    WHERE g.is_active=1 ORDER BY g.sort_order
  `).all(date, yesterday);
  res.json({ date, games });
});

/**
 * POST /api/admin/declare-result
 * Body: { game_id, result_number, result_date?, declared_time? }
 *  - result_date  : "YYYY-MM-DD" (optional, defaults today) — ANY past/future date allowed
 *  - declared_time: "HH:MM" 24h  (optional, defaults to now)
 */
router.post('/declare-result', (req, res) => {
  const { game_id, result_number, result_date, declared_time } = req.body;
  if (game_id == null || result_number == null)
    return res.status(400).json({ error: 'game_id and result_number required' });

  const num = parseInt(result_number, 10);
  if (isNaN(num) || num < 0 || num > 99)
    return res.status(400).json({ error: 'Result must be 00–99' });

  const db   = getDB();
  const game = db.prepare('SELECT * FROM games WHERE id=?').get(game_id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const date = result_date || getISTDate();
  const declaredAt = buildDeclaredAt(date, declared_time || '');
  if (!declaredAt) return res.status(400).json({ error: 'Invalid date or time format' });

  try {
    db.prepare(`
      INSERT INTO results (game_id, result_number, result_date, declared_at, declared_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(game_id, result_date) DO UPDATE SET
        result_number=excluded.result_number,
        declared_at=excluded.declared_at,
        declared_by=excluded.declared_by
    `).run(game_id, num, date, declaredAt, req.admin.username);

    const payload = {
      game_id, game_name: game.name, schedule_time: game.schedule_time,
      result_number: num, result_date: date, declared_at: declaredAt
    };
    // Only emit live to public if it's today's result
    if (date === getISTDate()) req.app.get('io').emit('new-result', payload);
    res.json({ success: true, result: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * PUT /api/admin/result/:id
 * Body: { result_number, result_date?, declared_time? }
 * Edit ANY existing result regardless of age. Can also change its date/time.
 */
router.put('/result/:id', (req, res) => {
  const { result_number, result_date, declared_time } = req.body;
  const num = parseInt(result_number, 10);
  if (isNaN(num) || num < 0 || num > 99)
    return res.status(400).json({ error: 'Result must be 00–99' });

  const db  = getDB();
  const row = db.prepare(
    'SELECT r.*, g.name AS game_name, g.schedule_time FROM results r JOIN games g ON r.game_id=g.id WHERE r.id=?'
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Result not found' });

  // Allow changing the date too; default to existing
  const newDate = result_date || row.result_date;
  const declaredAt = buildDeclaredAt(newDate, declared_time || '');
  if (!declaredAt) return res.status(400).json({ error: 'Invalid date or time format' });

  try {
    db.prepare(`
      UPDATE results
      SET result_number=?, result_date=?, declared_at=?, declared_by=?
      WHERE id=?
    `).run(num, newDate, declaredAt, req.admin.username, req.params.id);

    if (newDate === getISTDate()) {
      req.app.get('io').emit('new-result', {
        game_id: row.game_id, game_name: row.game_name, schedule_time: row.schedule_time,
        result_number: num, result_date: newDate, declared_at: declaredAt
      });
    }
    res.json({ success: true });
  } catch (err) {
    // Likely a UNIQUE(game_id,result_date) conflict if moving to a date that already has a result
    res.status(409).json({ error: 'A result already exists for that game on that date' });
  }
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
