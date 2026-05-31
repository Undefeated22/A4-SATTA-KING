/**
 * database.js  –  SQLite init, schema, seeding
 * FIX 1.3: Admin password now uses UPSERT so .env changes are honoured on restart
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'satta.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let _db = null;
function getDB() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL UNIQUE,
      schedule_time TEXT    NOT NULL,
      sort_order    INTEGER DEFAULT 0,
      is_active     INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS results (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id        INTEGER NOT NULL,
      result_number  INTEGER NOT NULL CHECK(result_number >= 0 AND result_number <= 99),
      result_date    TEXT    NOT NULL,
      declared_at    TEXT    NOT NULL,
      declared_by    TEXT    DEFAULT 'admin',
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      UNIQUE(game_id, result_date)
    );
    CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_results_date      ON results(result_date);
    CREATE INDEX IF NOT EXISTS idx_results_game_date ON results(game_id, result_date);
  `);

  /* ── Seed games ── */
  const gameCount = db.prepare('SELECT COUNT(*) as n FROM games').get().n;
  if (gameCount === 0) {
    const ins = db.prepare('INSERT OR IGNORE INTO games (name, schedule_time, sort_order) VALUES (?,?,?)');
    db.transaction(() => {
      [
        ['DISAWAR',      '05:10 AM',  1],
        // ['DELHI GOLD',   '12:45 PM',  2],
        ['SADAR BAZAR',  '01:30 PM',  3],
        ['GWALIOR',      '02:30 PM',  4],
         ['DELHI BAZAR',  '03:10 PM',  5],
        ['SHREE GANESH', '04:30 PM',  6],
        ['SITAPUR',      '05:30 PM',  7],
        ['FARIDABAD',    '06:06 PM',  8],
        // ['TAZ BAZAR',    '07:45 PM',  9],
        ['ELLANABAD',    '08:15 PM', 9],

        ['GAZIYABAD',    '08:50 PM', 10],
        // ['PARAS DAY',    '10:20 PM', 11],
        ['GURUGRAM',     '10:05 PM', 12],
        ['GALI',         '11:50 PM', 13],
      ].forEach(g => ins.run(...g));
    })();
    console.log('✅ Games seeded');
  }

  /* ── FIX 1.3: UPSERT admin password every startup from .env ── */
  const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
  const hash     = bcrypt.hashSync(password, 12);
  // INSERT OR REPLACE ensures the password from .env is ALWAYS applied
  db.prepare(`
    INSERT INTO admin_users (username, password_hash)
    VALUES ('admin', ?)
    ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
  `).run(hash);
  console.log('✅ Admin password synced from .env');
  console.log('✅ Database ready:', DB_PATH);
}

module.exports = { getDB, initDB };
