# AgriMandi Architecture & Design Notes 🌾

## 1. System Overview

AgriMandi connects local farmers directly with wholesale and retail buyers. The system is architected into three discrete tiers:

```
+-------------------------------------------------------------+
|                      Client Frontend                        |
|   HTML5 + Vanilla CSS + Vanilla JS (No build step / pure)   |
|   - Supabase Auth (Sign-in / Sign-up / Session JWT)         |
|   - Supabase Storage (Direct authenticated image uploads)   |
|   - api.js (Dispatches requests with Bearer JWT tokens)     |
+------------------------------+------------------------------+
                               |
                               | HTTP Bearer JWT
                               v
+-------------------------------------------------------------+
|                     Flask API Layer                         |
|   - Token extraction & profile role verification            |
|   - Input sanitization & state-transition enforcement       |
|   - Per-request Supabase client with user Authorization     |
|   - In-memory data store fallback (for offline tests/dev)   |
+------------------------------+------------------------------+
                               |
                               | PostgREST / RPC calls
                               v
+-------------------------------------------------------------+
|                 Supabase Cloud Database                     |
|   - PostgreSQL with Row Level Security (RLS) enforcement   |
|   - profiles, produce, orders tables                        |
|   - Atomic place_order(...) function with FOR UPDATE lock  |
|   - Role immutability triggers on profiles                  |
+-------------------------------------------------------------+
```

## 2. Row Level Security & Identity Model

- **Real Security Boundary**: Supabase RLS is the authoritative boundary. The Flask API sets the user's JWT on outbound requests so PostgreSQL evaluates `auth.uid()` against policies.
- **Roles in Profiles**: Role assignment (`farmer` vs `buyer`) is stored in `public.profiles`, not in client-mutable metadata or localStorage.
- **Stock Protection**: The PostgreSQL stored procedure `place_order` locks the produce row using `FOR UPDATE`, verifies availability, decrements stock, and calculates total price based strictly on the DB rate.

## 3. Screenshots

- **Landing Page**: Place screenshot at `docs/screenshots/landing.png`
- **Buyer Marketplace**: Place screenshot at `docs/screenshots/buyer-marketplace.png`
- **Farmer Management Portal**: Place screenshot at `docs/screenshots/farmer-portal.png`
- **Order Success**: Place screenshot at `docs/screenshots/order-success.png`
