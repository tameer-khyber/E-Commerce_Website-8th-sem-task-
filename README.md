# S&P Clovers — E-Commerce Sprint 2

S&P Clovers is an online store for casual shirts and pants. Sprint 1 selected HTML/CSS/JS (frontend), Node.js with Express (backend), and PostgreSQL (database). Sprint 2 implements the catalog data foundation — the database schema, admin API, seed data, and automated tests — that Sprints 3 and beyond will build the storefront on top of.

---

## Sprint 2 Implementation Summary

- PostgreSQL migration: 12 tables covering users, categories (self-referencing tree), products, color variants, size SKUs, assets, reviews, wishlist items, carts, cart items, orders, and order items.
- JWT-based admin authentication with distinct 401 / 403 responses.
- Category CRUD with cycle prevention (a category cannot become its own ancestor).
- Product CRUD with JSONB specifications validation (fabric, fit, care_instructions).
- Color variant creation per product (unique color per product enforced at DB level).
- Size SKU creation per variant (unique size per color variant; unique sku_code globally).
- Soft delete / deactivation for categories, products, and SKUs (no hard deletes).
- Money handled as `DECIMAL(10,2)` in the DB and returned as string in the API.
- Seed data: 3-level concept (Clothing → Shirts / Pants), 3 products, 4 valid SKUs.
- Automated Jest/Supertest test suite using pg-mem (no real DB needed to run tests).

---

## Local Setup

**Requirements:** Node.js 18+ and PostgreSQL 14+

```bash
# 1. Clone and install dependencies
npm install

# 2. Copy environment file and fill in your values
cp .env.example .env

# 3. Create the PostgreSQL database
createdb spclovers   # or use psql / pgAdmin

# 4. Run the migration (creates all 12 tables)
npm run migrate

# 5. Seed sample data
npm run seed

# 6. Run tests (uses in-memory DB — no PostgreSQL needed)
npm test

# 7. Start the API server
npm start
```

API base URL: `http://localhost:3000`

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | API server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_SECRET` | Secret for signing JWTs — **do not commit the real value** | `dev-secret` |
| `ADMIN_EMAIL` | Seed admin email | `admin@spclovers.local` |
| `ADMIN_PASSWORD` | Seed admin password — **do not commit a production password** | `Admin@12345` |

---

## Admin Login

```
POST /api/v1/auth/login
Content-Type: application/json

{"email":"admin@spclovers.local","password":"Admin@12345"}
```

Response: `{"token":"<JWT>"}` — use as `Authorization: Bearer <token>` on all `/api/v1/admin/*` routes. Token expires in 2 hours.

---

## Admin API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Login → JWT |
| POST | `/api/v1/admin/categories` | Create category |
| GET | `/api/v1/admin/categories` | List all categories |
| PATCH | `/api/v1/admin/categories/:id` | Update / reactivate category |
| DELETE | `/api/v1/admin/categories/:id` | Soft-deactivate category |
| POST | `/api/v1/admin/products` | Create product (with specifications) |
| GET | `/api/v1/admin/products` | List products with category name |
| PATCH | `/api/v1/admin/products/:id` | Update product fields or status |
| DELETE | `/api/v1/admin/products/:id` | Archive product |
| POST | `/api/v1/admin/products/:id/variants` | Add color variant |
| POST | `/api/v1/admin/products/:id/skus` | Add size SKU to a variant |
| PATCH | `/api/v1/admin/skus/:id` | Update SKU price, stock, or active |
| DELETE | `/api/v1/admin/skus/:id` | Soft-deactivate SKU |

---

## Running Tests

```bash
npm test
```

Tests use `pg-mem` (in-memory PostgreSQL) — no live database connection is required. The test suite covers:

1. Admin creates category and product — 201 responses
2. Duplicate product slug — 400 rejection
3. Duplicate color variant for same product — 400 rejection
4. Duplicate SKU code + negative stock/price — 400 rejections
5. Category cycle prevention (ancestor loop) — 400 rejection
6. Invalid specifications keys — 422 rejection
7. Unauthenticated (401) and non-admin customer (403) rejections

---

## Sprint 2 Evidence

After running `npm run migrate` and `npm run seed`, capture API request/response pairs and paste them into `docs/SPRINT_2.md` Section 6. Redact all real JWT tokens before committing. The test result (`npm test`) should also be pasted into Section 7.
