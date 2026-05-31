/**
 * admin-views/assets/admin.js  –  A4 Satta King Admin Panel
 *
 * FIX 4.1: Result input uses a <select> dropdown (00-99) instead of
 *   type="number", preventing browsers from stripping leading zeros.
 *   Numbers are always integers in the DB; display padding happens client-side.
 */

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let token        = localStorage.getItem('sk_admin_token') || '';
let dashboardData= [];
let editResultId = null;   // ID of result being edited
let socket       = null;

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  populateResultDropdowns();
  startClock();
  setHistoryDateToToday();

  if (token) {
    showAdmin();
  }

  /* Login */
  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  /* Logout */
  document.getElementById('btn-logout').addEventListener('click', logout);

  /* Edit modal – close on backdrop click */
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });
});

/* ══════════════════════════════════════════════
   FIX 4.1 – populate result select (00-99)
══════════════════════════════════════════════ */
function populateResultDropdowns() {
  [document.getElementById('edit-result-num')].forEach(sel => {
    if (!sel) return;
    for (let i = 0; i <= 99; i++) {
      const opt = document.createElement('option');
      opt.value       = i;        // integer sent to API
      opt.textContent = pad(i);   // "00", "01", ... displayed
      sel.appendChild(opt);
    }
  });
}

/* ══════════════════════════════════════════════
   CLOCK
══════════════════════════════════════════════ */
function startClock() {
  function tick() {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const s = ist.toISOString().replace('T',' ').slice(0,19);
    const el = document.getElementById('admin-clock');
    if (el) el.textContent = '⏱ ' + s + ' IST';
  }
  tick(); setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════ */
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  if (!username || !password) { showLoginError('Username and password required'); return; }
  btn.textContent = 'Logging in...'; btn.disabled = true;

  try {
    const res  = await api('/api/admin/login', 'POST', { username, password }, false);
    token = res.token;
    localStorage.setItem('sk_admin_token', token);
    errEl.style.display = 'none';
    showAdmin();
  } catch (err) {
    showLoginError(err.message || 'Login failed');
  } finally {
    btn.textContent = '🔐 LOGIN'; btn.disabled = false;
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = '⚠️ ' + msg; el.style.display = 'block';
}

function logout() {
  token = '';
  localStorage.removeItem('sk_admin_token');
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

/* ══════════════════════════════════════════════
   SOCKET.IO
══════════════════════════════════════════════ */
function initSocket() {
  if (socket) socket.disconnect();
  socket = io({ reconnectionDelay: 1000 });

  socket.on('connect',    () => setWsDot(true));
  socket.on('disconnect', () => setWsDot(false));

  // Real-time: update the card in dashboard without full reload
  socket.on('new-result', data => {
    patchDashboardCard(data);
    toast('📣 ' + data.game_name + ': ' + pad(data.result_number) + ' declared');
  });
  socket.on('result-deleted', () => loadDashboard());
}

function setWsDot(connected) {
  const dot = document.getElementById('ws-dot');
  const lbl = document.getElementById('ws-label');
  if (!dot) return;
  dot.className = 'ws-dot' + (connected ? ' connected' : '');
  lbl.textContent = connected ? 'Live' : 'Reconnecting...';
}

/* ══════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════ */
async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard');
    dashboardData = data.games || [];

    document.getElementById('today-date').textContent = data.date || '—';
    document.getElementById('stat-total').textContent    = dashboardData.length;
    const declared = dashboardData.filter(g => g.result_number !== null && g.result_number !== undefined);
    document.getElementById('stat-declared').textContent = declared.length;
    document.getElementById('stat-pending').textContent  = dashboardData.length - declared.length;

    const lastD = declared.sort((a,b)=>(b.declared_at||'').localeCompare(a.declared_at||''))[0];
    document.getElementById('last-declared').textContent =
      lastD ? lastD.name + ': ' + pad(lastD.result_number) + ' @ ' + fmtTime(lastD.declared_at) : '—';

    renderGameCards(dashboardData);
  } catch(e) {
    if (e.status === 401 || e.status === 403) logout();
    toast('Dashboard load failed: ' + e.message, 'error');
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
    const yesterdayBit = g.yesterday_number !== null && g.yesterday_number !== undefined
      ? `<div class="yesterday-num">Yesterday: <b>${pad(g.yesterday_number)}</b></div>`
      : '';
    const declMeta = isDeclared
      ? `<div class="result-meta">Declared: ${fmtTime(g.declared_at)}</div>`
      : '';

    // Build a result-select dropdown per card (FIX 4.1)
    const opts = Array.from({length:100},(_,i)=>`<option value="${i}" ${isDeclared && g.result_number===i?'selected':''}>${pad(i)}</option>`).join('');
    const declareBlock = isDeclared
      ? `<div class="game-card-footer">
           <button class="btn-edit"   onclick="openEdit(${g.result_id},'${g.name}',${g.result_number})">✏️ Edit</button>
           <button class="btn-delete" onclick="deleteResult(${g.result_id},${g.id},'${g.name}')">🗑 Delete</button>
         </div>`
      : `<div class="declare-form">
           <select id="sel-${g.id}">${opts}</select>
           <button class="btn-declare" onclick="declareResult(${g.id},'${g.name}')">Declare</button>
         </div>`;

    return `<div class="game-card ${isDeclared?'declared':'pending'}" id="card-${g.id}">
      <div class="game-card-header">
        <div>
          <div class="game-card-name">${g.name}</div>
          <div class="game-card-time">${g.schedule_time}</div>
        </div>
        <span class="badge ${isDeclared?'declared':'pending'}">${isDeclared?'✓ DECLARED':'PENDING'}</span>
      </div>
      <div class="game-result-row">${resultDisplay}<div>${declMeta}${yesterdayBit}</div></div>
      ${declareBlock}
    </div>`;
  }).join('');
}

/** Update a single card after a socket event, without re-rendering all */
function patchDashboardCard(data) {
  const idx = dashboardData.findIndex(g => g.id === data.game_id);
  if (idx === -1) { loadDashboard(); return; }
  dashboardData[idx].result_number = data.result_number;
  dashboardData[idx].declared_at   = data.declared_at;
  dashboardData[idx].result_id     = dashboardData[idx].result_id || Date.now();

  // Update stats
  const declared = dashboardData.filter(g => g.result_number !== null && g.result_number !== undefined);
  document.getElementById('stat-declared').textContent = declared.length;
  document.getElementById('stat-pending').textContent  = dashboardData.length - declared.length;
  document.getElementById('last-declared').textContent =
    data.game_name + ': ' + pad(data.result_number) + ' @ ' + fmtTime(data.declared_at);

  // Re-render just that card
  renderGameCards(dashboardData);
}

/* ══════════════════════════════════════════════
   DECLARE / EDIT / DELETE
══════════════════════════════════════════════ */
async function declareResult(gameId, gameName) {
  const sel = document.getElementById('sel-' + gameId);
  if (!sel) return;
  const num = parseInt(sel.value, 10);

  try {
    await api('/api/admin/declare-result', 'POST', { game_id: gameId, result_number: num });
    toast('✅ ' + gameName + ': ' + pad(num) + ' declared!');
    loadDashboard();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

function openEdit(resultId, gameName, currentNum) {
  editResultId = resultId;
  document.getElementById('edit-modal-subtitle').textContent = 'Game: ' + gameName;
  document.getElementById('edit-result-num').value = currentNum;
  document.getElementById('edit-modal').classList.add('open');
}
function closeEditModal() {
  editResultId = null;
  document.getElementById('edit-modal').classList.remove('open');
}
async function submitEdit() {
  if (editResultId == null) return;
  const num = parseInt(document.getElementById('edit-result-num').value, 10);
  try {
    await api('/api/admin/result/' + editResultId, 'PUT', { result_number: num });
    toast('✅ Result updated to ' + pad(num));
    closeEditModal();
    loadDashboard();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteResult(resultId, gameId, gameName) {
  if (!confirm('Delete result for ' + gameName + '?')) return;
  try {
    await api('/api/admin/result/' + resultId, 'DELETE');
    toast('🗑 Result for ' + gameName + ' deleted');
    loadDashboard();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════
   HISTORY TAB
══════════════════════════════════════════════ */
function setHistoryDateToToday() {
  const ist  = new Date(Date.now() + 5.5 * 3600 * 1000);
  const date = ist.toISOString().slice(0,10);
  const el   = document.getElementById('history-date');
  if (el) el.value = date;
}

async function loadHistory() {
  const date  = document.getElementById('history-date').value;
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray)">Loading...</td></tr>';
  try {
    const rows = await api('/api/admin/history?date=' + date);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--gray)">No results for this date</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><b>${r.game_name}</b></td>
        <td style="color:var(--gray)">${r.schedule_time}</td>
        <td class="num-cell">${pad(r.result_number)}</td>
        <td style="color:var(--gray)">${fmtTime(r.declared_at)}</td>
        <td style="color:var(--gray)">${r.declared_by}</td>
        <td>
          <button class="btn-edit" style="font-size:.78rem;padding:4px 10px" onclick="openEdit(${r.id},'${r.game_name}',${r.result_number})">✏️</button>
          <button class="btn-delete" style="font-size:.78rem;padding:4px 10px;margin-left:4px" onclick="deleteResult(${r.id},${r.game_id},'${r.game_name}')">🗑</button>
        </td>
      </tr>`).join('');
  } catch(e) {
    toast('History load failed', 'error');
  }
}

/* ══════════════════════════════════════════════
   SETTINGS – CHANGE PASSWORD
══════════════════════════════════════════════ */
async function changePassword() {
  const old_password = document.getElementById('old-pass').value;
  const new_password = document.getElementById('new-pass').value;
  const conf         = document.getElementById('conf-pass').value;
  const msgEl        = document.getElementById('pw-msg');

  msgEl.style.display = 'none';
  if (!old_password || !new_password) { showPwMsg('All fields required', 'error'); return; }
  if (new_password !== conf)           { showPwMsg('New passwords do not match', 'error'); return; }
  if (new_password.length < 8)         { showPwMsg('Min 8 characters', 'error'); return; }

  try {
    await api('/api/admin/change-password', 'POST', { old_password, new_password });
    showPwMsg('✅ Password changed. You will be logged out.', 'ok');
    setTimeout(logout, 2000);
  } catch(e) {
    showPwMsg('Error: ' + e.message, 'error');
  }
}

function showPwMsg(msg, type) {
  const el = document.getElementById('pw-msg');
  el.textContent   = msg;
  el.style.display = 'block';
  el.style.color   = type === 'ok' ? 'var(--green)' : 'var(--red)';
}

/* ══════════════════════════════════════════════
   TABS
══════════════════════════════════════════════ */
window.openTab = function(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.getElementById('tab-' + name);
  const pnl = document.getElementById('panel-' + name);
  if (btn) btn.classList.add('active');
  if (pnl) pnl.classList.add('active');
  if (name === 'history') loadHistory();
};

/* ══════════════════════════════════════════════
   API HELPER
══════════════════════════════════════════════ */
async function api(url, method = 'GET', body = null, useToken = true) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (useToken && token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : type === 'info' ? ' info' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(40px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),350); }, 4500);
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function pad(n) { return String(n).padStart(2,'0'); }
function fmtTime(s) {
  if (!s) return '—';
  try {
    const [,t] = s.split(' ');
    const [h,m] = t.split(':').map(Number);
    return pad(h%12||12)+':'+pad(m)+' '+(h>=12?'PM':'AM');
  } catch { return s; }
}
