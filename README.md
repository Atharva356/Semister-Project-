# AgriMandi 🌾

> Connecting Farmers Directly to Buyers — Fair Pricing, Fresh Harvests, Zero Middlemen.

AgriMandi is a modern agricultural marketplace web application designed to empower farmers and agricultural producers by connecting them directly with consumers, restaurants, and wholesale buyers. By eliminating intermediaries and traders, farmers secure better profit margins while buyers receive fresher produce at fair, transparent rates.

---

## 🏛️ System Architecture

```
+-------------------------------------------------------------+
|                      Client Frontend                        |
|   HTML5 + Vanilla CSS + Vanilla JavaScript (Pure Client)    |
|   - Supabase Auth (Sign-in / Sign-up / Session JWT)         |
|   - Supabase Storage (Produce images bucket)                |
|   - api.js (Transmits Authorization: Bearer <jwt>)          |
+------------------------------+------------------------------+
                               |
                               | HTTP Bearer JWT
                               v
+-------------------------------------------------------------+
|                     Flask API Layer                         |
|   - @require_auth and @require_role decorators              |
|   - Authoritative profile role verification                 |
|   - Per-request Supabase client with user Authorization     |
|   - In-memory data store fallback (for offline tests/dev)   |
+------------------------------+------------------------------+
                               |
                               | PostgREST / RPC calls
                               v
+-------------------------------------------------------------+
|                 Supabase Cloud Database                     |
|   - PostgreSQL with Row Level Security (RLS) enforcement   |
|   - Profiles, Produce, and Orders tables                    |
|   - Atomic place_order(...) function with FOR UPDATE lock  |
|   - Strict role immutability triggers on profiles           |
+------------------------------+------------------------------+
```

---

## 🛠️ Technology Stack

- **Frontend**: Plain HTML5, Modern Vanilla CSS (`style.css`), Vanilla JavaScript (`app.js`, `api.js`, `supabaseClient.js`, `config.js`). No frameworks or build step required.
- **Authentication & Storage**: [Supabase](https://supabase.com) (Supabase Auth with JWT tokens, Supabase Storage for crop images).
- **Backend API**: Python 3.11+, [Flask](https://flask.palletsprojects.com/) (Application factory, Blueprints, CORS).
- **Production Server**: Gunicorn WSGI.
- **Database & Security**: Supabase PostgreSQL with Row Level Security (RLS) policies, atomic stored procedures, and foreign key indexes.
- **Automated Testing & CI**: Pytest, Flask Test Client, GitHub Actions (`.github/workflows/test.yml`).

---

## 🔐 Security & Authorization Model

1. **Supabase Auth on the Frontend**: Users authenticate directly with Supabase. User passwords never touch the Flask server.
2. **Bearer Token Transmission**: The frontend client automatically includes the Supabase session access token as `Authorization: Bearer <jwt>` on all mutating operations and order queries.
3. **Per-Request RLS Context**: The Flask backend constructs a per-request client passing the user's Bearer token. Supabase evaluates `auth.uid()` against PostgreSQL Row Level Security (RLS) policies.
4. **Authoritative Roles**: Roles (`farmer` vs `buyer`) are strictly stored in the `public.profiles` database table and protected by database triggers that reject unauthorized role modifications.
5. **Server-Side Price Calculation**: When placing an order, the server locks the item row (`SELECT ... FOR UPDATE`), checks stock, decrements quantity, and calculates the total price from the database rate. Any client-submitted prices are ignored.
6. **XSS Protection**: Dynamic DOM insertions use `escapeHtml()` sanitization and event delegation (`data-id` / `data-order-id`), eliminating inline `onclick` string injection vectors.

---

## 🚀 Setup & Installation Guide

### Prerequisites

- Python 3.10+ installed
- Modern web browser
- (Optional for cloud DB) A free [Supabase](https://supabase.com) account

---

### Step 1: Database Setup (Supabase)

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Navigate to **SQL Editor -> New Query**.
3. Copy and run the contents of [`backend/schema.sql`](backend/schema.sql) (or [`backend/migration.sql`](backend/migration.sql) if upgrading an existing v1 database).
4. Create a public Storage bucket named `produce-images`:
   - Go to **Storage -> New Bucket**
   - Bucket name: `produce-images`
   - Set to **Public bucket**
5. Retrieve your project credentials from **Project Settings -> API**:
   - `Project URL`
   - `anon public key`

---

### Step 2: Backend Setup (Flask API)

1. Open a terminal and navigate to `backend/`:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   # Windows
   python -m venv .venv
   .\.venv\Scripts\activate

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure your environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `backend/.env`:
   ```env
   PORT=5000
   HOST=0.0.0.0
   DEBUG=False
   USE_MEMORY_DB=false
   CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-supabase-anon-or-service-role-key
   ```
   *(Note: To run offline without Supabase credentials, set `USE_MEMORY_DB=true`)*

5. Start the Flask server:
   ```bash
   python app.py
   ```
   The backend API will run at **`http://localhost:5000`**.

---

### Step 3: Frontend Setup

1. Copy the example frontend configuration:
   ```bash
   cp config.example.js config.js
   ```
2. Update `config.js` with your API and Supabase values:
   ```javascript
   window.AGRIMANDI_CONFIG = {
     apiBaseUrl: "http://localhost:5000",
     supabaseUrl: "https://your-project-id.supabase.co",
     supabaseAnonKey: "your-supabase-anon-key"
   };
   ```
3. Start any lightweight static web server in the repository root:
   ```bash
   # Using Python
   python -m http.server 5500

   # Or using Node
   npx serve .
   ```
4. Open **`http://localhost:5500`** in your browser.

---

### Step 4: Creating Demo Accounts

1. Open `http://localhost:5500/register.html`.
2. **Farmer Account**:
   - Full Name: `Rameshwar Patel`
   - Email: `farmer@example.com`
   - Password: `password123`
   - Role: `🚜 Farmer (I want to sell my produce)`
   - Location: `Sehore, Madhya Pradesh`
3. **Buyer Account**:
   - Full Name: `Ananya Sharma`
   - Email: `buyer@example.com`
   - Password: `password123`
   - Role: `🛒 Buyer (I want to buy fresh produce)`
   - Location: `Pune, Maharashtra`
4. Once your farmer account is registered, run [`backend/seed.sql`](backend/seed.sql) in your Supabase SQL editor to link the sample crop listings to that farmer.

---

## 📡 REST API Summary

### Produce Endpoints (`/api/produce`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/produce` | Public | Query produce with filters (`?search=`, `?category=`, `?location=`, `?min_price=`, `?max_price=`, `?page=`, `?limit=`) |
| `GET` | `/api/produce/<id>` | Public | Get single produce item details |
| `GET` | `/api/produce/stats` | Public | Aggregate marketplace inventory volume and listings count |
| `POST` | `/api/produce` | Farmer only | Create new produce listing (attaches farmer identity from JWT) |
| `PUT` | `/api/produce/<id>` | Farmer only | Update listing (ownership verified) |
| `DELETE` | `/api/produce/<id>` | Farmer only | Delete listing (ownership verified) |

### Orders Endpoints (`/api/orders`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/orders` | Authenticated | List orders scoped to caller (buyer sees own; farmer sees their produce) |
| `GET` | `/api/orders/<id>` | Buyer or Farmer | Get single order detail (ownership verified) |
| `POST` | `/api/orders` | Buyer only | Place purchase order (atomic stock decrement, server price computation) |
| `PATCH` | `/api/orders/<id>/status` | Buyer or Farmer | Update fulfillment status. Farmer: Pending -> Confirmed -> Dispatched -> Delivered. Buyer can cancel Pending orders. Stock restored on cancellation. |

---

## 🧪 Running Automated Tests

Run the test suite using pytest inside the `backend/` virtual environment:

```bash
cd backend
pytest tests/ -v
```

Tests cover:
- Authentication enforcement (401 on missing tokens)
- Role authorization (403 on role mismatch)
- Farmer listing isolation (cannot modify another farmer's crop)
- Server-side order total price calculation
- Out-of-stock and insufficient stock rejection
- Order status state-machine transitions and cancellation stock recovery
- Centralized payload validation

---

## 🚢 Deployment

### Backend Deployment (Render / Railway)
- Use the included [`render.yaml`](render.yaml) or [`Procfile`](Procfile).
- Set Environment Variables: `SUPABASE_URL`, `SUPABASE_KEY`, `CORS_ORIGINS`, `DEBUG=false`.
- Start Command: `gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 4`

### Frontend Deployment (Netlify / Vercel / GitHub Pages)
- Deploy root directory as static assets.
- Configure `config.js` to point `apiBaseUrl` to your deployed backend URL.

---

## 📁 Repository Structure

```text
AgriMandi/
├── index.html              # Homepage / Landing page
├── buyer-dashboard.html    # Buyer marketplace with search, filters & purchase modal
├── farmer-dashboard.html   # Farmer management portal with listings & orders tabs
├── login.html              # User login page
├── register.html           # User registration page
├── order-success.html      # Verified order confirmation page
├── app.js                  # Frontend application logic & UI bindings
├── api.js                  # Centralized REST API fetch dispatcher with JWT handling
├── supabaseClient.js       # Supabase Auth client & storage image upload helpers
├── config.example.js       # Frontend configuration template
├── style.css               # Unified responsive stylesheet
├── Procfile                # Heroku / Render process file
├── render.yaml             # Render infrastructure blueprint
├── LICENSE                 # MIT License
├── docs/                   # Architecture documentation & screenshots
│   └── architecture.md
├── .github/workflows/      # Automated CI test workflows
│   └── test.yml
└── backend/                # Flask REST API service
    ├── app.py              # Application factory (create_app), CORS, error handlers
    ├── wsgi.py             # WSGI entrypoint for Gunicorn
    ├── config.py           # Configuration loader
    ├── auth.py             # @require_auth & @require_role decorators
    ├── validation.py       # Input validation & state transitions
    ├── db.py               # Supabase client adapter & in-memory store
    ├── schema.sql          # Supabase SQL schema & RLS policies
    ├── migration.sql       # v1 to v2 database migration script
    ├── seed.sql            # Demo produce seeding script
    ├── requirements.txt    # Pinned Python dependencies
    ├── .env.example        # Environment variables template
    ├── routes/
    │   ├── __init__.py
    │   ├── produce.py      # /api/produce routes
    │   └── orders.py       # /api/orders routes
    └── tests/
        ├── conftest.py     # Pytest fixtures & memory DB state isolation
        └── test_api.py     # Comprehensive test suite
```

---

## ⚠️ Known Limitations

1. **Direct Purchase Model**: Currently purchases are placed per crop item. A multi-vendor unified cart is not implemented in this version.
2. **Payment Processing**: Orders use a direct invoice/Cash-on-Delivery confirmation model; third-party payment gateway integration (Razorpay/Stripe) is scheduled for a future release.
3. **Email Notifications**: Order status updates are tracked within the dashboard; external transactional email delivery (SMTP/Resend) requires additional webhook configuration.

---

## 👨‍💻 Author

- **Atharva Chavan** ([@Atharva356](https://github.com/Atharva356))
- Aryan Nerkar
- Krushna Mistari(@krushnagajananmistari)
- Gaurav Patil(@Gauravpatil25)
