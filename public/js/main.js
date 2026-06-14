/**
 * public/js/main.js – A4 Satta King Frontend (with features integrated)
 */

let allGames     = [];
let todayData    = [];
let latestResult = null;

const MONTH_NAMES = ['','January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

document.addEventListener('DOMContentLoaded', () => {
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();

  startClock();
  setCurrentMonthYear();
  loadGamesDropdown();
  fetchAndRenderToday();
  initSocket();
  loadChart();

  buildWinnersTicker();                       // feature 6
  setInterval(refreshCountdowns, 1000);       // feature 3

  // history popup close handlers
  const hb = document.getElementById('history-backdrop');
  if (hb) hb.addEventListener('click', e => { if (e.target.id === 'history-backdrop') closeGameHistory(); });
});

function setCurrentMonthYear() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  document.getElementById('chart-month').value = ist.getMonth() + 1;
  document.getElementById('chart-year').value  = ist.getFullYear();
}

function startClock() {
  const el = document.getElementById('live-clock');
  setInterval(() => {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    el.textContent = '⏱ IST: ' + ist.toISOString().replace('T',' ').slice(0,19) + ' (भारतीय समय)';
  }, 1000);
}

function initSocket() {
  const socket = io({ reconnectionDelay: 1000, reconnectionAttempts: Infinity });
  socket.on('connect',    () => updateBadge(true));
  socket.on('disconnect', () => updateBadge(false));

  socket.on('new-result', data => {
    updateHero(data, true);                   // animate reveal
    patchResultInTable(data, true);
    fireConfetti();                            // feature 2
    showToast('🎉 ' + data.game_name + ': ' + pad(data.result_number));

    const ist    = new Date(Date.now() + 5.5 * 3600 * 1000);
    const cMonth = parseInt(document.getElementById('chart-month').value);
    const cYear  = parseInt(document.getElementById('chart-year').value);
    if (cMonth === ist.getMonth() + 1 && cYear === ist.getFullYear()) loadChart();
  });

  socket.on('result-deleted', () => fetchAndRenderToday());
}

function updateBadge(connected) {
  const b = document.getElementById('live-badge');
  if (!b) return;
  b.textContent  = connected ? '🔴 LIVE RESULT' : '⚪ RECONNECTING...';
  b.style.background = connected ? 'var(--green)' : '#888';
}

function updateHero(result, animate) {
  latestResult = result;
  document.getElementById('hero-game-name').textContent     = result.game_name;
  document.getElementById('hero-schedule-time').textContent = '( ' + result.schedule_time + ' )';
  const numEl = document.getElementById('hero-number');
  numEl.style.cssText = 'font-family:var(--font-disp);font-size:5rem;font-weight:800;line-height:1.1;color:var(--gold);text-shadow:0 0 40px rgba(255,215,0,.7),0 0 80px rgba(255,215,0,.3);animation:glow-pulse 2s ease-in-out infinite;transition:all .4s ease';
  if (animate && typeof animateReveal === 'function') animateReveal(numEl, result.result_number);
  else numEl.textContent = pad(result.result_number);
  document.getElementById('hero-declared-at').textContent =
    result.declared_at ? 'घोषित: ' + formatTime(result.declared_at) : '';
}

async function fetchAndRenderToday() {
  try {
    const res = await fetch('/api/today-results');
    if (!res.ok) throw new Error('API error');
    todayData = await res.json();
    renderTable(todayData);
    const declared = todayData.filter(d => d.today)
      .sort((a,b) => (b.today.declared_at||'').localeCompare(a.today.declared_at||''));
    if (declared.length > 0 && !latestResult)
      updateHero({...declared[0].today, game_name: declared[0].game_name, schedule_time: declared[0].schedule_time}, false);
  } catch(e) {
    console.error(e);
    document.getElementById('results-tbody').innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:var(--red);padding:20px">⚠️ रिजल्ट लोड करने में त्रुटि।</td></tr>';
  }
}

function renderTable(data) {
  const tbody = document.getElementById('results-tbody');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--gray)">कोई गेम उपलब्ध नहीं</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(row => {
    const todayNum = row.today
      ? '<span class="num-today">' + pad(row.today.result_number) + '</span>'
      : '<span class="spinner"></span><div class="countdown" data-schedule="' + row.schedule_time + '"></div>';
    const yestNum = row.yesterday
      ? '<span class="num-yesterday">' + pad(row.yesterday.result_number) + '</span>'
      : '<span style="color:var(--gray)">—</span>';
    const declTime = row.today
      ? '<span class="time-small">' + formatTime(row.today.declared_at) + '</span>'
      : '<span class="time-small" style="color:var(--gray)">अभी बाकी</span>';
    return '<tr data-game-id="' + row.game_id + '">' +
      '<td><span class="game-link" onclick="openGameHistory(' + row.game_id + ',\'' + row.game_name.replace(/'/g,"\\'") + '\')">' + row.game_name + '</span><span class="game-time">' + row.schedule_time + '</span></td>' +
      '<td>' + yestNum + '</td><td>' + todayNum + '</td><td>' + declTime + '</td></tr>';
  }).join('');
  refreshCountdowns();
}

function patchResultInTable(result, animate) {
  const row = document.querySelector('#results-tbody tr[data-game-id="' + result.game_id + '"]');
  if (!row) { fetchAndRenderToday(); return; }
  const cells = row.querySelectorAll('td');
  cells[2].innerHTML = '<span class="num-today" id="rt-' + result.game_id + '">00</span>';
  cells[3].innerHTML = '<span class="time-small">' + formatTime(result.declared_at) + '</span>';
  const numEl = document.getElementById('rt-' + result.game_id);
  if (animate && typeof animateReveal === 'function') animateReveal(numEl, result.result_number);
  else numEl.textContent = pad(result.result_number);
  const idx = todayData.findIndex(d => d.game_id === result.game_id);
  if (idx !== -1) todayData[idx].today = result;
}

async function loadGamesDropdown() {
  try {
    const res = await fetch('/api/games');
    allGames  = await res.json();
    const sel = document.getElementById('chart-game');
    allGames.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id; opt.textContent = g.name;
      sel.appendChild(opt);
    });
  } catch(e) { console.error(e); }
}

window.loadChart = async function() {
  const gameId    = document.getElementById('chart-game').value;
  const month     = document.getElementById('chart-month').value;
  const year      = document.getElementById('chart-year').value;
  const container = document.getElementById('chart-container');
  const titleEl   = document.getElementById('chart-title');
  container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-family:var(--font-head);letter-spacing:2px">LOADING...</div>';
  try {
    if (gameId) {
      const res  = await fetch('/api/chart?game_id=' + gameId + '&month=' + month + '&year=' + year);
      const data = await res.json();
      const name = allGames.find(g => g.id == gameId)?.name || 'Game';
      titleEl.textContent = name + ' — ' + MONTH_NAMES[+month] + ' ' + year;
      container.innerHTML = renderSingleChart(data);
    } else {
      const res  = await fetch('/api/chart-multi?month=' + month + '&year=' + year);
      const data = await res.json();
      titleEl.textContent = 'सभी गेम — ' + MONTH_NAMES[+month] + ' ' + year;
      container.innerHTML = renderMultiChart(data);
    }
  } catch(e) {
    console.error(e);
    container.innerHTML = '<div style="text-align:center;color:var(--red);padding:20px">⚠️ Chart load failed.</div>';
  }
};

function renderSingleChart(data) {
  const today = new Date(Date.now() + 5.5*3600*1000).toISOString().slice(0,10);
  const rows = (data.rows||[]).map(r => {
    const n = (r.result_number !== null && r.result_number !== undefined) ? pad(r.result_number) : '<span class="no-result">—</span>';
    return '<tr class="' + (r.date === today ? 'today-row' : '') + '"><td>' + fmtDate(r.date) + '</td><td>' + n + '</td></tr>';
  }).join('');
  return '<table class="chart-table"><thead><tr><th>DATE</th><th>RESULT</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderMultiChart(data) {
  if (!data.rows || !data.games) return '<p style="text-align:center;padding:20px;color:var(--gray)">No data</p>';
  const today = new Date(Date.now() + 5.5*3600*1000).toISOString().slice(0,10);
  const hdr = data.games.map(g => '<th>' + g.name + '</th>').join('');
  const rows = data.rows.map(r => {
    const cells = data.games.map(g => {
      const v = r.results[g.id];
      return '<td>' + (v !== null && v !== undefined ? pad(v) : '<span class="no-result">—</span>') + '</td>';
    }).join('');
    return '<tr class="' + (r.date === today ? 'today-row' : '') + '"><td>' + fmtDate(r.date) + '</td>' + cells + '</tr>';
  }).join('');
  return '<table class="chart-table"><thead><tr><th>DATE</th>' + hdr + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function showToast(msg, err) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className   = 'toast' + (err ? ' error' : '');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(16px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),350); }, 4000);
}

function pad(n) { return String(n).padStart(2,'0'); }
function formatTime(s) {
  if (!s) return '';
  try { const [,t]=s.split(' '); const [h,m]=t.split(':').map(Number); return pad(h%12||12)+':'+pad(m)+' '+(h>=12?'PM':'AM'); } catch{return s;}
}
function fmtDate(s) { if(!s) return ''; const [,m,d]=s.split('-'); return d+'-'+m; }
