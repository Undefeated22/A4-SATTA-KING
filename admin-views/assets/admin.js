/**
 * admin-views/assets/admin.js  –  A4 Satta King Admin Panel
 *
 * NEW:
 *  - Dashboard date picker → declare/edit results for ANY day
 *  - Custom declared-time field (defaults to now, can be set to any time)
 *  - Edit modal supports changing number, date, and time of any result
 */

let token         = localStorage.getItem('sk_admin_token') || '';
let dashboardData = [];
let dashboardDate = '';          // currently viewed date on dashboard
let editResultId  = null;
let editRowData   = null;        // full row being edited
let socket        = null;

window.addEventListener('DOMContentLoaded', () => {
  populateResultDropdowns();
  startClock();
  setDashboardDateToToday();
  setHistoryDateToToday();

  if (token) showAdmin();

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('edit-modal').addEventListener('click', e => { if (e.target.id === 'edit-modal') closeEditModal(); });

  // Dashboard date change → reload that day
  const dd = document.getElementById('dashboard-date');
  if (dd) dd.addEventListener('change', () => { dashboardDate = dd.value; loadDashboard(); });
});

/* ── Result dropdowns (00-99) ────────────────────────────── */
function populateResultDropdowns() {
  const sel = document.getElementById('edit-result-num');
  if (sel) for (let i = 0; i <= 99; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = pad(i); sel.appendChild(o);
  }
}

/* ── Clock ───────────────────────────────────────────────── */
function startClock() {
  function tick() {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const el = document.getElementById('admin-clock');
    if (el) el.textContent = '⏱ ' + ist.toISOString().replace('T',' ').slice(0,19) + ' IST';
  }
  tick(); setInterval(tick, 1000);
}

function istToday() { return new Date(Date.now() + 5.5*3600*1000).toISOString().slice(0,10); }
function istNowHHMM() { return new Date(Date.now() + 5.5*3600*1000).toISOString().slice(11,16); }

function setDashboardDateToToday() {
  dashboardDate = istToday();
  const el = document.getElementById('dashboard-date');
  if (el) el.value = dashboardDate;
}
function setHistoryDateToToday() {
  const el = document.getElementById('history-date');
  if (el) el.value = istToday();
}

/* ── Auth ────────────────────────────────────────────────── */
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const btn = document.getElementById('btn-login');
  if (!username || !password) { showLoginError('Username and password required'); return; }
  btn.textContent = 'Logging in...'; btn.disabled = true;
  try {
    const res = await api('/api/admin/login', 'POST', { username, password }, false);
    token = res.token;
    localStorage.setItem('sk_admin_token', token);
    document.getElementById('login-error').style.display = 'none';
    showAdmin();
  } catch (err) { showLoginError(err.message || 'Login failed'); }
  finally { btn.textContent = '🔐 LOGIN'; btn.disabled = false; }
}
function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = '⚠️ ' + msg; el.style.display = 'block';
}
function logout() {
  token = ''; localStorage.removeItem('sk_admin_token');
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  if (socket) socket.disconnect();
}
function showAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  loadDashboard();
  initSocket();
  openTab('dashboard');
}

/* ── Socket ──────────────────────────────────────────────── */
function initSocket() {
  if (socket) socket.disconnect();
  socket = io({ reconnectionDelay: 1000 });
  socket.on('connect',    () => setWsDot(true));
  socket.on('disconnect', () => setWsDot(false));
  socket.on('new-result', data => {
    // only refresh if we are viewing the same date
    if (dashboardDate === data.result_date) loadDashboard();
    toast('📣 ' + data.game_name + ': ' + pad(data.result_number));
  });
  socket.on('result-deleted', () => loadDashboard());
}
function setWsDot(c) {
  const dot = document.getElementById('ws-dot'), lbl = document.getElementById('ws-label');
  if (!dot) return;
  dot.className = 'ws-dot' + (c ? ' connected' : '');
  lbl.textContent = c ? 'Live' : 'Reconnecting...';
}

/* ── Dashboard ───────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard?date=' + dashboardDate);
    dashboardData = data.games || [];

    const isToday = dashboardDate === istToday();
    const banner  = document.getElementById('date-context');
    if (banner) banner.textContent = isToday ? 'आज / Today' : 'पुरानी तारीख / Past date — ' + dashboardDate;

    document.getElementById('stat-total').textContent = dashboardData.length;
    const declared = dashboardData.filter(g => g.result_number !== null && g.result_number !== undefined);
    document.getElementById('stat-declared').textContent = declared.length;
    document.getElementById('stat-pending').textContent  = dashboardData.length - declared.length;

    renderGameCards(dashboardData);
  } catch(e) {
    if (e.status === 401 || e.status === 403) logout();
    else toast('Dashboard load failed: ' + e.message, 'error');
  }
}

function renderGameCards(games) {
  const grid = document.getElementById('games-grid');
  if (!games.length) { grid.innerHTML = '<p style="color:var(--gray)">No games found</p>'; return; }

  grid.innerHTML = games.map(g => {
    const isDeclared = g.result_number !== null && g.result_number !== undefined;
    const resultDisplay = isDeclared
      ? `<span class="result-num-big">${pad(g.result_number)}</span>`
      : `<span class="result-num-big pending">—</span>`;
    const yesterdayBit = (g.yesterday_number !== null && g.yesterday_number !== undefined)
      ? `<div class="yesterday-num">Prev day: <b>${pad(g.yesterday_number)}</b></div>` : '';
    const declMeta = isDeclared ? `<div class="result-meta">Declared: ${fmtTime(g.declared_at)}</div>` : '';

    const opts = Array.from({length:100},(_,i)=>`<option value="${i}" ${isDeclared && g.result_number===i?'selected':''}>${pad(i)}</option>`).join('');

    // Declare form now includes an optional time input (defaults to now)
    const declareBlock = isDeclared
      ? `<div class="game-card-footer">
           <button class="btn-edit"   onclick="openEdit(${g.result_id},'${esc(g.name)}',${g.result_number},'${g.declared_at||''}','${dashboardDate}')">✏️ Edit</button>
           <button class="btn-delete" onclick="deleteResult(${g.result_id},'${esc(g.name)}')">🗑 Delete</button>
         </div>`
      : `<div class="declare-form">
           <select id="sel-${g.id}">${opts}</select>
           <input type="time" id="time-${g.id}" class="time-input" title="Declared time (optional)"/>
           <button class="btn-declare" onclick="declareResult(${g.id},'${esc(g.name)}')">Declare</button>
         </div>`;

    return `<div class="game-card ${isDeclared?'declared':'pending'}" id="card-${g.id}">
      <div class="game-card-header">
        <div><div class="game-card-name">${g.name}</div><div class="game-card-time">${g.schedule_time}</div></div>
        <span class="badge ${isDeclared?'declared':'pending'}">${isDeclared?'✓ DECLARED':'PENDING'}</span>
      </div>
      <div class="game-result-row">${resultDisplay}<div>${declMeta}${yesterdayBit}</div></div>
      ${declareBlock}
    </div>`;
  }).join('');
}

/* ── Declare (for the currently selected dashboard date) ──── */
async function declareResult(gameId, gameName) {
  const sel  = document.getElementById('sel-' + gameId);
  const time = document.getElementById('time-' + gameId);
  if (!sel) return;
  const num  = parseInt(sel.value, 10);
  const body = { game_id: gameId, result_number: num, result_date: dashboardDate };
  if (time && time.value) body.declared_time = time.value;   // custom time if set
  try {
    await api('/api/admin/declare-result', 'POST', body);
    toast('✅ ' + gameName + ': ' + pad(num) + ' declared');
    loadDashboard();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

/* ── Edit modal (number + date + time) ───────────────────── */
function openEdit(resultId, gameName, currentNum, declaredAt, resultDate) {
  editResultId = resultId;
  document.getElementById('edit-modal-subtitle').textContent = 'Game: ' + gameName;
  document.getElementById('edit-result-num').value = currentNum;
  document.getElementById('edit-date').value = resultDate || istToday();
  // Pre-fill time from declaredAt "YYYY-MM-DD HH:MM:SS"
  const t = (declaredAt && declaredAt.length >= 16) ? declaredAt.slice(11,16) : istNowHHMM();
  document.getElementById('edit-time').value = t;
  document.getElementById('edit-modal').classList.add('open');
}
function closeEditModal() {
  editResultId = null;
  document.getElementById('edit-modal').classList.remove('open');
}
async function submitEdit() {
  if (editResultId == null) return;
  const num  = parseInt(document.getElementById('edit-result-num').value, 10);
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  const body = { result_number: num, result_date: date };
  if (time) body.declared_time = time;
  try {
    await api('/api/admin/result/' + editResultId, 'PUT', body);
    toast('✅ Result updated');
    closeEditModal();
    loadDashboard();
    if (document.getElementById('panel-history').classList.contains('active')) loadHistory();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteResult(resultId, gameName) {
  if (!confirm('Delete result for ' + gameName + '?')) return;
  try {
    await api('/api/admin/result/' + resultId, 'DELETE');
    toast('🗑 Deleted ' + gameName);
    loadDashboard();
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

/* ── History ─────────────────────────────────────────────── */
async function loadHistory() {
  const date  = document.getElementById('history-date').value;
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray)">Loading...</td></tr>';
  try {
    const rows = await api('/api/admin/history?date=' + date);
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray)">No results for this date</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><b>${r.game_name}</b></td>
        <td style="color:var(--gray)">${r.schedule_time}</td>
        <td class="num-cell">${pad(r.result_number)}</td>
        <td style="color:var(--gray)">${fmtTime(r.declared_at)}</td>
        <td style="color:var(--gray)">${r.declared_by}</td>
        <td>
          <button class="btn-edit" style="font-size:.78rem;padding:0 10px;min-height:32px" onclick="openEdit(${r.id},'${esc(r.game_name)}',${r.result_number},'${r.declared_at||''}','${r.result_date}')">✏️</button>
          <button class="btn-delete" style="font-size:.78rem;padding:0 10px;min-height:32px;margin-left:4px" onclick="deleteResult(${r.id},'${esc(r.game_name)}')">🗑</button>
        </td>
      </tr>`).join('');
  } catch(e) { toast('History load failed', 'error'); }
}

/* ── Settings ────────────────────────────────────────────── */
async function changePassword() {
  const old_password = document.getElementById('old-pass').value;
  const new_password = document.getElementById('new-pass').value;
  const conf = document.getElementById('conf-pass').value;
  document.getElementById('pw-msg').style.display = 'none';
  if (!old_password || !new_password) return showPwMsg('All fields required','error');
  if (new_password !== conf)          return showPwMsg('New passwords do not match','error');
  if (new_password.length < 8)        return showPwMsg('Min 8 characters','error');
  try {
    await api('/api/admin/change-password', 'POST', { old_password, new_password });
    showPwMsg('✅ Password changed. Logging out...', 'ok');
    setTimeout(logout, 2000);
  } catch(e) { showPwMsg('Error: ' + e.message, 'error'); }
}
function showPwMsg(msg, type) {
  const el = document.getElementById('pw-msg');
  el.textContent = msg; el.style.display = 'block';
  el.style.color = type === 'ok' ? 'var(--green)' : 'var(--red)';
}

/* ── Tabs ────────────────────────────────────────────────── */
window.openTab = function(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.getElementById('tab-' + name), pnl = document.getElementById('panel-' + name);
  if (btn) btn.classList.add('active');
  if (pnl) pnl.classList.add('active');
  if (name === 'history') loadHistory();
};

/* ── API helper ──────────────────────────────────────────── */
async function api(url, method='GET', body=null, useToken=true) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (useToken && token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e; }
  return data;
}

/* ── Toast ───────────────────────────────────────────────── */
function toast(msg, type='success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (type==='error'?' error':type==='info'?' info':'');
  t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(16px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),350); }, 4500);
}

/* ── Helpers ─────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2,'0'); }
function esc(s) { return String(s).replace(/'/g, "\\'"); }
function fmtTime(s) {
  if (!s) return '—';
  try { const [,t]=s.split(' '); const [h,m]=t.split(':').map(Number); return pad(h%12||12)+':'+pad(m)+' '+(h>=12?'PM':'AM'); }
  catch { return s; }
}
