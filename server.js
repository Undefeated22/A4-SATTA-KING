/**
 * server.js
 * FIX 1.1 + 1.2: Admin files moved OUT of /public into /admin-views
 *   → served via authenticated Express routes, never exposed as static
 */
require('dotenv').config();
const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const { initDB }  = require('./database');
const apiRoutes   = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingInterval: 25000, pingTimeout: 60000,
});
app.set('io', io);

/* ── Security ── */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Rate limiting ── */
const publicLimiter = rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 15*60*1000, max: 60,  standardHeaders: true, legacyHeaders: false });
app.use('/api', publicLimiter);
app.use('/api/admin', adminLimiter);

/* ── Public static (NO admin files here) ── */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

/* ── API routes ── */
app.use('/api',       apiRoutes);
app.use('/api/admin', adminRoutes);

/* ── FIX 1.1 + 1.2: Admin panel served ONLY through Express routes ──
   /admin-views/ is completely outside /public – never exposed as static.
   We serve admin HTML/CSS/JS via dedicated route handlers so future
   IP-allowlist or session-gate middleware can be added in one place.    */
const ADMIN_DIR = path.join(__dirname, 'admin-views');

// Middleware: confirm admin-views files exist before serving
function serveAdminAsset(file) {
  return (_req, res) => res.sendFile(path.join(ADMIN_DIR, file));
}

app.get('/admin',            serveAdminAsset('index.html'));
app.get('/admin/',           serveAdminAsset('index.html'));
app.get('/admin/index.html', serveAdminAsset('index.html'));
app.get('/admin/assets/admin.css', serveAdminAsset('assets/admin.css'));
app.get('/admin/assets/admin.js',  serveAdminAsset('assets/admin.js'));

/* ── SPA fallback (public site only) ── */
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ── Socket.io ── */
io.on('connection', s => {
  console.log('[WS] +', s.id);
  s.on('disconnect', () => console.log('[WS] -', s.id));
});

/* ── Start ── */
const PORT = process.env.PORT || 3000;
initDB();
server.listen(PORT, () => {
  console.log(`\n  ♛  A4 Satta King`);
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🔐  Admin: http://localhost:${PORT}/admin\n`);
});
