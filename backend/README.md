# AgriMandi Backend API 🌾

REST API service built with **Python & Flask** for the **AgriMandi** direct farmer-to-buyer marketplace.

---

## 📌 Architecture & Design Principles

1. **Authentication via Supabase Auth + JWT Verification**:
   - Supabase Auth handles user registration and login on the client.
   - Frontend passes access tokens via `Authorization: Bearer <jwt>` on every write and order read.
   - Flask verifies the JWT, retrieves profile roles, and queries Supabase with a per-request authenticated client so Row Level Security (RLS) is strictly enforced.
2. **Data & Persistence**:
   - Connects to **Supabase PostgreSQL** (`profiles`, `produce`, and `orders` tables).
   - An explicit in-memory data store can be enabled with `USE_MEMORY_DB=true` for local development and test automation.
3. **CORS & Security**:
   - Configurable origins via `CORS_ORIGINS` (defaults to local Vite / Live Server ports).
   - Centralized input validation, strict state transitions, and server-side price computation.

---

## 📁 Folder Structure

```text
backend/
├── app.py              # Application factory (create_app), CORS, blueprint registry
├── wsgi.py             # Production WSGI entry point for Gunicorn
├── config.py           # Configuration loader (reads .env, ports, credentials)
├── auth.py             # @require_auth and @require_role decorators
├── validation.py       # Centralized payload validation & state transitions
├── db.py               # Supabase per-request client and in-memory store
├── routes/
│   ├── __init__.py     # Blueprint module exports
│   ├── produce.py      # /api/produce endpoints (CRUD, search, filters, pagination)
│   └── orders.py       # /api/orders endpoints (Atomic order placement, status updates)
├── schema.sql          # Supabase SQL schema (Tables, RLS policies, triggers, place_order)
├── migration.sql       # SQL migration from v1 to v2 schema
├── seed.sql            # Demo listings seeding script
├── requirements.txt    # Pinned Python dependencies
├── .env.example        # Environment variable template
└── README.md           # Documentation and API reference
```

---

## 🚀 Getting Started

### 1. Setup Virtual Environment

```bash
cd backend

# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Variables

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Set your configuration:
```env
PORT=5000
HOST=0.0.0.0
DEBUG=False
USE_MEMORY_DB=false
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-key
```

### 4. Run Development Server

```bash
python app.py
```

### 5. Production Server (Gunicorn)

```bash
# Start Gunicorn with wsgi.py
gunicorn wsgi:app --bind 0.0.0.0:5000 --workers 4 --timeout 60
```

---

## 📡 API Reference

### Produce Endpoints (`/api/produce`)

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/produce` | Public | List produce with search (`?search=`), category (`?category=`), location (`?location=`), price range (`?min_price=`, `?max_price=`), and pagination (`?page=`, `?limit=`) |
| `GET` | `/api/produce/<id>` | Public | Get single produce item details |
| `GET` | `/api/produce/stats` | Public | Aggregated inventory volume & total listings count |
| `POST` | `/api/produce` | Farmer only | Create produce listing (farmer identity attached automatically) |
| `PUT` | `/api/produce/<id>` | Farmer only | Update produce listing (owner check enforced) |
| `DELETE` | `/api/produce/<id>` | Farmer only | Delete produce listing (owner check enforced) |

### Orders Endpoints (`/api/orders`)

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/orders` | Any user | List orders scoped to caller (buyer sees own orders; farmer sees orders for their crops) |
| `GET` | `/api/orders/<id>` | Buyer or Farmer | Get single order detail (must be buyer or farmer of that order) |
| `POST` | `/api/orders` | Buyer only | Place new order (atomic stock decrement, server-computed total price) |
| `PATCH` | `/api/orders/<id>/status` | Buyer or Farmer | Update order status. Farmer transitions: Pending -> Confirmed -> Dispatched -> Delivered; Buyer can cancel Pending orders. Stock restored on cancellation. |
