/**
 * features.js — A4 Satta King extra features
 *  1. Animated number reveal (slot machine)
 *  2. Confetti on new result
 *  3. Countdown timer to next game
 *  4. Floating WhatsApp button (in HTML)
 *  5. Per-game history popup
 *  6. Winners ticker (in HTML, populated here)
 */

/* ════════════════════════════════════════════
   1. ANIMATED NUMBER REVEAL
   Call animateReveal(el, finalNumber)
════════════════════════════════════════════ */
function animateReveal(el, finalNum) {
  if (!el) return;
  const final = String(finalNum).padStart(2, '0');
  let ticks = 0;
  const maxTicks = 14;
  el.classList.add('slot-rolling');
  const iv = setInterval(() => {
    el.textContent = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    ticks++;
    if (ticks >= maxTicks) {
      clearInterval(iv);
      el.classList.remove('slot-rolling');
      el.textContent = final;
      el.classList.add('reveal-pop');
      setTimeout(() => el.classList.remove('reveal-pop'), 700);
    }
  }, 60);
}

/* ════════════════════════════════════════════
   2. CONFETTI
════════════════════════════════════════════ */
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#ffd700', '#e8000d', '#00cc44', '#ffffff', '#c8a200'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    r: 4 + Math.random() * 6,
    c: colors[Math.floor(Math.random() * colors.length)],
    vy: 2 + Math.random() * 4,
    vx: -2 + Math.random() * 4,
    rot: Math.random() * 360,
    vr: -6 + Math.random() * 12
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    });
    frame++;
    if (frame < 160) requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }
  draw();
}

/* ════════════════════════════════════════════
   3. COUNTDOWN TIMER
   Parses "05:10 AM" → next occurrence, shows time left
════════════════════════════════════════════ */
function parseScheduleToDate(scheduleStr) {
  // scheduleStr like "05:10 AM"
  const m = scheduleStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  // Build today's IST date with that time
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const target = new Date(Date.UTC(
    istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), h, min, 0
  ));
  // target is in "IST clock" space; compare against istNow in same space
  let diff = target.getTime() - istNow.getTime();
  if (diff < 0) diff += 24 * 3600 * 1000; // next day
  return diff;
}

function fmtCountdown(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}घं ${m}मि बाकी`;
  if (m > 0) return `${m}मि ${s}से बाकी`;
  return `${s}से बाकी`;
}

/** Refresh all countdown badges. Called every second. */
function refreshCountdowns() {
  document.querySelectorAll('.countdown[data-schedule]').forEach(el => {
    const ms = parseScheduleToDate(el.dataset.schedule);
    if (ms == null) { el.textContent = ''; return; }
    el.textContent = '⏳ ' + fmtCountdown(ms);
    if (ms < 30 * 60 * 1000) el.classList.add('soon');   // under 30 min
    else el.classList.remove('soon');
  });
}

/* ════════════════════════════════════════════
   5. HISTORY POPUP
════════════════════════════════════════════ */
async function openGameHistory(gameId, gameName) {
  const backdrop = document.getElementById('history-backdrop');
  const body = document.getElementById('history-sheet-body');
  document.getElementById('history-sheet-title').textContent = gameName;
  body.innerHTML = '<p style="text-align:center;color:var(--gray);padding:20px">Loading...</p>';
  backdrop.classList.add('open');

  // Fetch last 2 months and show last 30 entries
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const month = ist.getMonth() + 1;
  const year = ist.getFullYear();
  try {
    const res = await fetch(`/api/chart?game_id=${gameId}&month=${month}&year=${year}`);
    const data = await res.json();
    const today = ist.toISOString().slice(0, 10);
    const rows = (data.rows || [])
      .filter(r => r.result_number !== null && r.result_number !== undefined)
      .reverse();
    if (!rows.length) {
      body.innerHTML = '<p style="text-align:center;color:var(--gray);padding:20px">इस महीने का कोई रिजल्ट नहीं</p>';
      return;
    }
    body.innerHTML = '<table class="hs-table">' + rows.map(r =>
      `<tr class="${r.date === today ? 'today' : ''}"><td>${fmtFullDate(r.date)}</td><td>${pad(r.result_number)}</td></tr>`
    ).join('') + '</table>';
  } catch (e) {
    body.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px">History load failed</p>';
  }
}
function closeGameHistory() {
  document.getElementById('history-backdrop').classList.remove('open');
}
function fmtFullDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[+m]} ${y}`;
}

/* ════════════════════════════════════════════
   6. WINNERS TICKER
════════════════════════════════════════════ */
function buildWinnersTicker() {
  const el = document.getElementById('winners-inner');
  if (!el) return;
  const names = ['Rahul', 'Amit', 'Suresh', 'Vikas', 'Deepak', 'Manoj', 'Raju', 'Sonu', 'Karan', 'Ajay', 'Pawan', 'Ramesh'];
  const cities = ['Delhi', 'UP', 'Haryana', 'Punjab', 'Rajasthan', 'Bihar', 'MP', 'Gurugram', 'Faridabad', 'Ghaziabad'];
  const amounts = ['9,500', '19,000', '47,500', '95,000', '28,500', '57,000', '76,000'];
  let html = '';
  for (let i = 0; i < 14; i++) {
    const n = names[Math.floor(Math.random() * names.length)];
    const c = cities[Math.floor(Math.random() * cities.length)];
    const a = amounts[Math.floor(Math.random() * amounts.length)];
    html += `★ <b>${n}</b> from ${c} won ₹${a} &nbsp;&nbsp; `;
  }
  el.innerHTML = html;
}

/* helper (shared with main.js but defined safely) */
if (typeof pad === 'undefined') {
  window.pad = function (n) { return String(n).padStart(2, '0'); };
}
