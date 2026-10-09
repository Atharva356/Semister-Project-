# AgriMandi 🌾

> **Farmer-to-Buyer Direct Agricultural Marketplace**  
> Fair pricing, fresh harvest, and zero middleman exploitation. Built for real farmers and wholesale/consumer buyers in India.

AgriMandi connects rural farmers directly with consumers, restaurants, and retail buyers. By cutting out commission agents and traders, farmers earn fair remuneration while buyers receive verified, farm-fresh produce at transparent mandi rates.

---

## 🏛️ Architecture & Technology Stack

```
+-------------------------------------------------------------+
|                      Client Frontend                        |
|   Static HTML5 + Modern CSS + Vanilla JavaScript (No Build) |
|   - Supabase Auth (Sign-in / Sign-up / Password Recovery)   |
|   - Supabase Storage (Crop images bucket)                   |
|   - api.js (Transmits Authorization: Bearer <jwt>)          |
+------------------------------+------------------------------+
                               |
                               | HTTP Bearer JWT
                               v
+-------------------------------------------------------------+
|               Flask REST API (Python 3.11+)                 |
|   - Gunicorn WSGI (2-4 workers)                             |
|   - Structured JSON logging & fail-fast config validation   |
|   - Database-aware /api/health ping check                   |
|   - Per-request Supabase client with user Bearer JWT        |
|   - In-memory mock store (for offline tests/dev)            |
+------------------------------+------------------------------+
                               |
                               | PostgREST / RPC calls
                               v
+-------------------------------------------------------------+
|                 Supabase Cloud Database                     |
|   - PostgreSQL with strict Row Level Security (RLS)         |
|   - Profiles, Produce, and Orders tables                    |
|   - Atomic place_order & cancel_order stored procedures     |
|   - Role immutability triggers on profiles                  |
+------------------------------+------------------------------+
```

- **Frontend**: Plain HTML5, Vanilla CSS (`style.css`), Vanilla JavaScript (`app.js`, `api.js`, `supabaseClient.js`). No frameworks or bundler needed.
- **Backend API**: Python 3.11+, Flask (App factory, Blueprints, CORS, strict JSON error handlers).
- **Production Server**: Gunicorn WSGI server (`wsgi.py`).
- **Database & Auth**: [Supabase](https://supabase.com) (Auth, PostgreSQL with RLS, Storage).
- **CI / Testing**: Pytest (26 unit/integration tests), Ruff linter, GitHub Actions.

---

## ⚡ Deploy in 15 Minutes (Step-by-Step Production Guide)

Follow this guide to deploy your live instance of AgriMandi on **Render** (Backend API), **Netlify** (Frontend), and **Supabase** (Database & Auth).

### Step 1: Create Supabase Project & Run SQL Scripts

1. Log in to [Supabase](https://supabase.com) and click **New project**. Choose a strong database password and select a region close to your users (e.g., `South Asia (Mumbai)`).
2. Go to **SQL Editor -> New Query**.
3. Run the numbered scripts located in [`backend/sql/`](backend/sql/) in exact numerical order:
   - `01_tables_and_triggers.sql`: Creates `profiles`, `produce`, and `orders` tables plus data integrity triggers.
   - `02_security_and_rls.sql`: Enables Row Level Security (RLS) on all tables.
   - `03_rpc_functions.sql`: Installs atomic `place_order` and `cancel_order` PL/pgSQL functions.
   - `04_storage_bucket.sql`: Creates the public `produce-images` bucket with upload restrictions.
   - `05_indexes_and_performance.sql`: Creates performance indexes for fast catalog search and order history.
4. Retrieve your API credentials:
   - Go to **Project Settings -> API**.
   - Note down **Project URL** (`https://<project-id>.supabase.co`) and **anon public key**.

---

### Step 2: Deploy Flask API on Render

1. Log in to [Render](https://render.com) and click **New + -> Web Service**.
2. Connect your GitHub repository (`Atharva356/Semister-Project-` or fork).
3. Set the following configuration:
   - **Name**: `agrimandi-api`
   - **Language**: `Python 3`
   - **Root Directory**: Leave blank (uses repo root)
   - **Build Command**: `cd backend && pip install --upgrade pip && pip install -r requirements.txt`
   - **Start Command**: `cd backend && gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 4 --threads 2 --timeout 120`
   - **Health Check Path**: `/api/health`
4. Add the following **Environment Variables**:
   | Key | Value | Description |
   |---|---|---|
   | `ENVIRONMENT` | `production` | Enables production safeguards |
   | `DEBUG` | `false` | Disables debug mode |
   | `USE_MEMORY_DB` | `false` | Connects to live Supabase Postgres |
   | `SECRET_KEY` | *(Generate a 32-char hex string)* | Cryptographic session secret |
   | `SUPABASE_URL` | `https://<your-project-id>.supabase.co` | Your Supabase project URL |
   | `SUPABASE_KEY` | *(Your Supabase anon or service-role key)* | Supabase API key |
   | `CORS_ORIGINS` | `https://<your-site>.netlify.app` | Your frontend Netlify URL (update once deployed) |
5. Click **Create Web Service**. Wait for the deployment to finish and copy your Render URL (e.g., `https://agrimandi-api.onrender.com`).
6. Test your live health endpoint:
   ```bash
   curl -i https://agrimandi-api.onrender.com/api/health
   # Should return HTTP 200 with {"status":"healthy", "database": {"connected": true}}
   ```

---

### Step 3: Deploy Frontend on Netlify

1. Log in to [Netlify](https://netlify.com) and click **Add new site -> Import an existing project**.
2. Select your GitHub repository.
3. Configure build settings:
   - **Base directory**: Leave blank
   - **Build command**: `node scripts/build-config.js`
   - **Publish directory**: `.`
4. Click **Environment variables** and add:
   | Key | Value | Description |
   |---|---|---|
   | `API_BASE_URL` | `https://agrimandi-api.onrender.com` | Deployed Render API URL |
   | `SUPABASE_URL` | `https://<your-project-id>.supabase.co` | Supabase Project URL |
   | `SUPABASE_ANON_KEY` | *(Your Supabase anon key)* | Supabase Public Anon Key |
5. Click **Deploy AgriMandi**. Netlify will run `scripts/build-config.js` to generate `config.js` and serve your static assets with security headers defined in `netlify.toml`.
6. Copy your Netlify site URL (e.g., `https://agrimandi.netlify.app`).
7. **Important**: Go back to Render -> `agrimandi-api` -> **Environment** and update `CORS_ORIGINS` to match your Netlify URL:
   ```
   CORS_ORIGINS=https://agrimandi.netlify.app
   ```

---

### Step 4: Configure Supabase Auth Redirect URLs

1. In the Supabase Dashboard, navigate to **Authentication -> URL Configuration**.
2. Set **Site URL** to:
   ```
   https://agrimandi.netlify.app
   ```
3. In **Redirect URLs (Allow list)**, add:
   ```
   https://agrimandi.netlify.app/**
   https://agrimandi.netlify.app/reset-password.html
   https://agrimandi.netlify.app/login.html
   http://localhost:5500/**
   http://127.0.0.1:5500/**
   http://localhost:8080/**
   ```
4. Click **Save**.

---

### Step 5: Create First Accounts & Seed Produce

1. Open your deployed Netlify site (`https://agrimandi.netlify.app/register.html`).
2. Create your first user account:
   - **Full Name**: `Rameshwar Patel`
   - **Email**: `farmer@example.com`
   - **Role**: Select **🚜 Farmer (Sell Produce)**
   - **Location**: `Sehore, Madhya Pradesh`
3. *(Optional)* Seed initial catalog listings:
   - In Supabase SQL Editor, run [`backend/sql/06_seed_catalog.sql`](backend/sql/06_seed_catalog.sql).
   - This script automatically links sample crops (wheat, tomatoes, apples, onions, rice) to your newly created farmer account!
4. Register a second account as a **🛒 Buyer** (`buyer@example.com`).
5. Browse produce, place a purchase order, view confirmation with tracking number, and see stock decrement in real-time.

---

## 💻 Local Development Setup

### Option A: Local Python & Browser (Recommended for quick testing)

1. Clone repository:
   ```bash
   git clone https://github.com/Atharva356/Semister-Project-.git
   cd Semister-Project-
   ```
2. Configure frontend:
   ```bash
   cp config.example.js config.js
   ```
3. Start backend in offline mock mode (zero Supabase setup required):
   ```bash
   cd backend
   python -m venv .venv
   # Windows: .\.venv\Scripts\activate | macOS/Linux: source .venv/bin/activate
   pip install -r requirements.txt
   
   # Enable offline in-memory database
   cp .env.example .env
   # Set USE_MEMORY_DB=true in .env
   python app.py
   ```
4. In another terminal, serve the frontend:
   ```bash
   # From project root
   python -m http.server 5500
   ```
5. Open `http://localhost:5500` in your browser.

---

### Option B: Docker Compose (One-command setup)

```bash
docker compose up --build
```
- Frontend available at: `http://localhost:8080`
- Backend API available at: `http://localhost:5000`

---

## 🧪 Testing & Quality Assurance

Run the automated test suite locally:
```bash
cd backend
pytest tests/ -v
```

Run code style & quality check:
```bash
ruff check backend/
```

The test suite contains 26 comprehensive tests covering:
- Role-based authorization & ownership enforcement
- Concurrency & inventory safety during order placement
- State transition validation (Pending -> Confirmed -> Dispatched -> Delivered)
- Server-side price calculation integrity
- Production startup safeguards and fail-fast environment checks
- Structured JSON logging and stack trace leakage prevention

---

## 🛠️ Troubleshooting Guide

### 1. CORS Error: `Access to fetch at ... has been blocked by CORS policy`
- **Cause**: The frontend origin making requests is not listed in the backend's `CORS_ORIGINS` variable.
- **Fix**:
  1. Note the exact protocol and hostname of your frontend (e.g. `https://my-site.netlify.app`, no trailing slash).
  2. Open your Render Dashboard -> Service Settings -> Environment Variables.
  3. Update `CORS_ORIGINS` to include your frontend URL:
     ```
     CORS_ORIGINS=https://my-site.netlify.app,http://localhost:5500
     ```
  4. Wait for Render to redeploy.

### 2. Auth Redirect Loop or Session Lost after Email Confirmation / Password Reset
- **Cause**: Supabase Auth redirect URLs are missing your production domain in the allow list.
- **Fix**:
  1. In Supabase Dashboard, go to **Authentication -> URL Configuration**.
  2. Ensure your Netlify URL is in the **Redirect URLs** list:
     ```
     https://<your-site>.netlify.app/**
     ```
  3. Ensure your Site URL is set to `https://<your-site>.netlify.app`.

### 3. Missing `config.js` or 404 in Browser Console
- **Cause**: `config.js` is deliberately excluded from git via `.gitignore` to prevent secret leakage.
- **Fix**:
  - **On Netlify/Vercel**: Ensure your build command is set to `node scripts/build-config.js` and you configured `API_BASE_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` in platform environment variables.
  - **Locally**: Run `cp config.example.js config.js` and fill in your local API / Supabase values.

### 4. Startup Error: `USE_MEMORY_DB cannot be enabled in production environments`
- **Cause**: `USE_MEMORY_DB` is set to `true` while `ENVIRONMENT=production` or running on Render.
- **Fix**: In production, in-memory storage is prohibited for data durability. Set `USE_MEMORY_DB=false` and provide valid `SUPABASE_URL` and `SUPABASE_KEY` values in your production environment.

### 5. API Returns 503 Service Unavailable on `/api/health`
- **Cause**: The backend is running in live database mode (`USE_MEMORY_DB=false`) but cannot establish a network connection to Supabase PostgreSQL.
- **Fix**:
  1. Verify `SUPABASE_URL` begins with `https://` and has no trailing slash.
  2. Verify `SUPABASE_KEY` is your active project key from Supabase Dashboard -> Project Settings -> API.
  3. Check the Supabase project status to ensure the database instance is not paused.

---

## 💾 Database Backups & Index Review

Detailed operational and architectural documentation:
- **[Database Backup & Disaster Recovery Guide](docs/database_backup_and_indexes.md#part-1-database-backup-strategy)**: Native Supabase backups, on-demand `pg_dump` commands, and restoration walkthrough.
- **[Database Index Review & Query Patterns](docs/database_backup_and_indexes.md#part-2-database-index-review--query-patterns)**: Detailed breakdown explaining each index and the exact query patterns accelerated for farmers and buyers.
- **[Supabase Auth Configuration Guide](docs/supabase_auth_guide.md)**: Email confirmation and password recovery flows.

---

## 📄 License

This project is licensed under the MIT License — see the [`LICENSE`](LICENSE) file for details.
