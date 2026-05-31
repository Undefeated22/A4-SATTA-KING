/**
 * routes/api.js  –  Public-facing API
 */
const express = require('express');
const router  = express.Router();
const { getDB } = require('../database');

function getISTDate(offsetDays = 0) {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}

// GET /api/games
router.get('/games', (_req, res) => {
  const games = getDB().prepare('SELECT * FROM games WHERE is_active=1 ORDER BY sort_order').all();
  res.json(games);
});

// GET /api/today-results
router.get('/today-results', (_req, res) => {
  const db = getDB();
  const today = getISTDate(0);
  const yesterday = getISTDate(-1);
  const games = db.prepare('SELECT * FROM games WHERE is_active=1 ORDER BY sort_order').all();
  const makeMap = d => {
    const rows = db.prepare('SELECT * FROM results WHERE result_date=?').all(d);
    return Object.fromEntries(rows.map(r => [r.game_id, r]));
  };
  const tMap = makeMap(today);
  const yMap = makeMap(yesterday);
  res.json(games.map(g => ({
    game_id: g.id, game_name: g.name, schedule_time: g.schedule_time,
    today: tMap[g.id] || null, yesterday: yMap[g.id] || null
  })));
});

// GET /api/live-result
router.get('/live-result', (_req, res) => {
  const result = getDB().prepare(`
    SELECT r.*, g.name AS game_name, g.schedule_time FROM results r
    JOIN games g ON r.game_id=g.id WHERE r.result_date=?
    ORDER BY r.declared_at DESC LIMIT 1
  `).get(getISTDate());
  res.json(result || null);
});

// GET /api/chart?game_id=1&month=5&year=2026
router.get('/chart', (req, res) => {
  const { game_id, month, year } = req.query;
  if (!game_id || !month || !year) return res.status(400).json({ error: 'game_id, month, year required' });
  const mm = String(month).padStart(2,'0');
  const results = getDB().prepare(`
    SELECT r.result_date, r.result_number, r.declared_at, g.name AS game_name
    FROM results r JOIN games g ON r.game_id=g.id
    WHERE r.game_id=? AND r.result_date BETWEEN ? AND ?
    ORDER BY r.result_date
  `).all(game_id, `${year}-${mm}-01`, `${year}-${mm}-31`);
  const byDate = Object.fromEntries(results.map(r => [r.result_date, r]));
  const days = new Date(year, month, 0).getDate();
  const rows = Array.from({length: days}, (_, i) => {
    const d = String(i+1).padStart(2,'0');
    const date = `${year}-${mm}-${d}`;
    return { date, day: i+1, ...(byDate[date] || { result_number: null }) };
  });
  res.json({ game_id, month, year, rows });
});

// GET /api/chart-multi?month=5&year=2026
router.get('/chart-multi', (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'month, year required' });
  const db = getDB();
  const mm = String(month).padStart(2,'0');
  const start = `${year}-${mm}-01`, end = `${year}-${mm}-31`;
  const games = db.prepare('SELECT * FROM games WHERE is_active=1 ORDER BY sort_order').all();
  const results = db.prepare(
    'SELECT game_id, result_date, result_number FROM results WHERE result_date BETWEEN ? AND ? ORDER BY result_date, game_id'
  ).all(start, end);
  const map = {};
  results.forEach(r => { map[r.result_date] = map[r.result_date] || {}; map[r.result_date][r.game_id] = r.result_number; });
  const days = new Date(year, month, 0).getDate();
  const rows = Array.from({length: days}, (_, i) => {
    const d = String(i+1).padStart(2,'0');
    const date = `${year}-${mm}-${d}`;
    return { date, day: i+1, results: map[date] || {} };
  });
  res.json({ games, rows, month, year });
});

module.exports = router;
