# AgriMandi Backend API 🌾

REST API service built with **Python & Flask** for the **AgriMandi** direct farmer-to-buyer marketplace.

---

## 📌 Architecture & Design Principles

1. **Authentication via Supabase**:
   - As per project specifications, **no authentication logic or password handling is implemented in this backend**.
   - User authentication (Sign Up, Sign In, OAuth, Session Tokens, Role Metadata) is handled directly by **Supabase Auth** on the frontend client.
2. **Data & Persistence**:
   - Configured to connect directly to your **Supabase PostgreSQL** instance (`produce` and `orders` tables).
   - If Supabase credentials are not provided, it seamlessly falls back to an **in-memory datastore with pre-seeded catalogue data** so you can develop and test immediately without configuring cloud credentials first.
3. **CORS Enabled**:
   - Ready to receive requests from any local or hosted frontend port (e.g. `http://localhost:5500`, `http://127.0.0.1:3000`, etc.).

---

## 📁 Folder Structure

```text
backend/
├── app.py              # Flask application factory, CORS setup, blueprint registration
├── config.py           # Configuration loader (reads .env, ports, Supabase credentials)
├── db.py               # Database layer (Supabase client integration + in-memory fallback)
├── routes/
│   ├── __init__.py     # Route exports
│   ├── produce.py      # /api/produce endpoints (CRUD, search, filters, stats)
│   └── orders.py       # /api/orders endpoints (Creation, retrieval, status updates)
├── schema.sql          # Supabase SQL schema (Tables, RLS policies, trigger & seed data)
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
└── README.md           # Documentation and API reference
```

---

## 🚀 Getting Started

### 1. Create a Virtual Environment

Open your terminal in the `backend/` directory:

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

### 3. (Optional) Configure Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor**, paste the contents of [`schema.sql`](schema.sql), and click **Run**.
3. Go to **Project Settings -> API** and copy:
   - **Project URL**
   - **anon / public key** or **service_role key**
4. Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
5. Update your `.env`:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your-supabase-key
   PORT=5000
   ```

*(Note: If you skip this step, the server will automatically run with the in-memory sample catalogue!)*

### 4. Start the Backend Server

```bash
python app.py
```

The API will be live at: **`http://localhost:5000`**

---

## 📡 API Reference

### Health & Status
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | API status and overview |
| `GET` | `/api/health` | Health check & Supabase connection state |

---

### Produce (Crops & Harvest Listings)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/produce` | Get all produce (supports `?search=`, `?category=`, `?location=`) |
| `GET` | `/api/produce/stats` | Aggregated metrics (total listings & total available quantity) |
| `GET` | `/api/produce/<id>` | Get details of a single produce item |
| `POST` | `/api/produce` | Create a new produce listing |
| `PUT` | `/api/produce/<id>` | Update an existing produce listing |
| `DELETE` | `/api/produce/<id>` | Delete a produce listing |

#### Example: Create Produce Listing
```bash
curl -X POST http://localhost:5000/api/produce \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Organic Red Hybrid Tomatoes",
    "category": "Vegetables",
    "quantity": 250,
    "unit": "Kg",
    "price": 28,
    "location": "Nashik, Maharashtra",
    "farmerName": "Sanjay Deshmukh"
  }'
```

---

### Orders (Purchases & Fulfillment)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/orders` | Get all orders (supports `?buyer_email=`, `?farmer_name=`) |
| `GET` | `/api/orders/<id>` | Get order summary by order ID |
| `POST` | `/api/orders` | Place a new purchase order |
| `PATCH` | `/api/orders/<id>/status` | Update fulfillment status (`Pending`, `Confirmed`, `Dispatched`, `Delivered`, `Cancelled`) |

#### Example: Place an Order
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "produceName": "Sharbati Wheat",
    "category": "Grains",
    "quantity": 2,
    "unit": "Quintal",
    "unitPrice": 3200,
    "totalPrice": 6400,
    "farmerName": "Rameshwar Patel",
    "farmerLocation": "Sehore, Madhya Pradesh",
    "buyerName": "Rahul Verma",
    "buyerEmail": "rahul@example.com",
    "deliveryAddress": "Flat 401, Sun City, Pune, Maharashtra"
  }'
```

#### Example: Update Order Status
```bash
curl -X PATCH http://localhost:5000/api/orders/AGRI-123456/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "Dispatched" }'
```
