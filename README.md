# ♛ A4 Satta King – Production Website

A full-stack real-time Satta King result website with admin panel.

## Tech Stack (all free)
| Layer | Tool |
|-------|------|
| Runtime | Node.js ≥ 18 |
| Framework | Express.js |
| Database | SQLite (better-sqlite3) — file-based, zero setup |
| Real-time | Socket.io |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Hosting | Render / Railway / VPS — free tiers available |

---

## Project Structure
```
satta-king/
├── server.js          ← Entry point
├── database.js        ← SQLite schema + seeding
├── .env               ← Environment variables (copy from .env.example)
├── routes/
│   ├── api.js         ← Public API routes
│   └── admin.js       ← Protected admin API routes
├── middleware/
│   └── auth.js        ← JWT middleware
├── public/            ← Public static assets ONLY
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js
└── admin-views/       ← Admin files — NOT inside /public (security fix)
    ├── index.html
    └── assets/
        ├── admin.css
        └── admin.js
```

---

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit environment file
cp .env.example .env
# → Set ADMIN_PASSWORD and JWT_SECRET

# 3. Start (production)
npm start

# 3b. Start (development, auto-reload)
npm run dev
```

Server starts at **http://localhost:3000**  
Admin panel at **http://localhost:3000/admin**

Default credentials: `admin` / `Admin@1234`  
**Change ADMIN_PASSWORD in .env before going live.**

---

## Free Hosting Options

### Option 1 – Render.com (recommended)
1. Push code to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `.env`
6. Free tier: 750 hrs/month (always-on with a paid plan)

### Option 2 – Railway.app
1. `npm install -g @railway/cli && railway login`
2. `railway init && railway up`
3. Set env vars in dashboard

### Option 3 – VPS (DigitalOcean / Hetzner / Oracle Free Tier)
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and run
git clone <your-repo>
cd satta-king && npm install
cp .env.example .env && nano .env

# Run with PM2 (keeps alive after logout)
npm install -g pm2
pm2 start server.js --name satta-king
pm2 save && pm2 startup
```

### Custom Domain + HTTPS (free with Cloudflare)
1. Add domain to Cloudflare (free plan)
2. Point A record to server IP
3. Cloudflare handles SSL automatically

---

## Admin Panel Usage

1. Go to `/admin`
2. Login with credentials from `.env`
3. **Dashboard tab**: See all games for today
   - Games with no result show a **Declare** button with a 00–99 dropdown
   - Declared games show **Edit** and **Delete** buttons
4. All website visitors see results update **live** (no refresh needed)
5. **History tab**: View + edit past results by date
6. **Settings tab**: Change your password

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/games` | No | All active games |
| GET | `/api/today-results` | No | Today + yesterday results for all games |
| GET | `/api/live-result` | No | Most recently declared result |
| GET | `/api/chart?game_id=&month=&year=` | No | Single game monthly chart |
| GET | `/api/chart-multi?month=&year=` | No | All games monthly chart |
| POST | `/api/admin/login` | No | Get JWT token |
| GET | `/api/admin/dashboard` | JWT | Today's game status |
| POST | `/api/admin/declare-result` | JWT | Declare result |
| PUT | `/api/admin/result/:id` | JWT | Edit result |
| DELETE | `/api/admin/result/:id` | JWT | Delete result |
| GET | `/api/admin/history?date=` | JWT | Past results by date |
| POST | `/api/admin/change-password` | JWT | Change admin password |

---

## Security Notes

- Admin HTML/CSS/JS served from `/admin-views/` (outside `/public/`) — not accessible as static files
- API routes protected by JWT — DB cannot be modified without a valid token
- Rate limiting: 300 req/15min (public), 60 req/15min (admin)
- Admin password re-synced from `.env` on every restart — changing `.env` always takes effect
- **Before going live**: generate a strong JWT_SECRET and set ADMIN_PASSWORD
