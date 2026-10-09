# AgriMandi Supabase SQL Scripts & Execution Checklist

This folder contains numbered, idempotent SQL scripts to provision and configure your Supabase PostgreSQL database and Storage.

> **CRITICAL GROUND RULE**: Scripts are never executed automatically by local tools or tests against your live Supabase project. You run these manually in the Supabase Dashboard SQL Editor following the sequence below.

---

## Execution Order Checklist

| Step | Script File | Description | Purpose |
|---|---|---|---|
| **1** | [`01_tables_and_triggers.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/01_tables_and_triggers.sql) | Tables & Integrity Triggers | Creates `profiles`, `produce`, and `orders` tables, plus triggers that sync `auth.users` to `profiles` and guard against illegal role mutations or order state edits. |
| **2** | [`02_security_and_rls.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/02_security_and_rls.sql) | Row Level Security (RLS) | Enables RLS across all tables and defines granular policies for public browsing, farmer modifications, and buyer privacy. |
| **3** | [`03_rpc_functions.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/03_rpc_functions.sql) | Atomic Stored Procedures | Deploys `place_order` (atomic stock deduction + order creation) and `cancel_order` (atomic stock restoration + cancellation). |
| **4** | [`04_storage_bucket.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/04_storage_bucket.sql) | Supabase Storage Bucket | Creates the `produce-images` public storage bucket (2MB limit, image MIME whitelist) and sets upload policies. |
| **5** | [`05_indexes_and_performance.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/05_indexes_and_performance.sql) | Performance Indexes | Creates targeted B-Tree indexes for category filtering, location search, and user dashboard query patterns. |
| **6** | [`06_seed_catalog.sql`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/backend/sql/06_seed_catalog.sql) | *(Optional)* Seed Crops | Inserts 5 demo crop listings (wheat, tomatoes, apples, onions, rice). **Run after creating your first farmer account.** |

---

## Step-by-Step Manual Guide

1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your project.
2. In the left navigation, click on **SQL Editor**.
3. Click **New query**.
4. Copy and paste the contents of `01_tables_and_triggers.sql` and click **Run**. Verify the green success toast.
5. Repeat for `02_security_and_rls.sql`, `03_rpc_functions.sql`, `04_storage_bucket.sql`, and `05_indexes_and_performance.sql`.
6. Go to **Authentication -> URL Configuration** and add your frontend URLs to the Redirect URLs list.
7. Go to your frontend, register a new account choosing role **Farmer**.
8. Return to the SQL Editor, paste `06_seed_catalog.sql`, and click **Run** to populate the demo produce for your farmer.

---

## Database Backups & Index Review Documentation
For backup instructions (`pg_dump` commands, restoration procedures) and an in-depth review of every database index and the query patterns it serves, see:
- [`docs/database_backup_and_indexes.md`](file:///c:/Users/athar/OneDrive/Desktop/AgriMandi/docs/database_backup_and_indexes.md)

