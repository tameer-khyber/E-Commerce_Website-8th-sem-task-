# Sprint 2: Catalog Data Foundation
### Project: S&P Clovers — Online Store for Shirts & Pants

## 1. Sprint Goal and Scope Boundary

This sprint turns the Sprint 1 S&P Clovers architecture into a reliable catalog database foundation. The implementation uses the Sprint 1 stack: Node.js with Express and PostgreSQL.

**What this sprint delivers:** a two-level category tree (self-referencing `parent_id` + unique slugs), product records split across `products` / `variants` / `skus`, admin-only authenticated CRUD endpoints, database-enforced constraints (Section 5), migration SQL, reproducible seed data for shirts and pants, and an automated test suite.

**Deferred to later sprints:** a dynamic specification editor, an image-upload pipeline, public catalog search, publish-workflow automation, payments, shipping, the shopper cart and checkout flow, reviews submission, and wishlist management. Where the data model needs a placeholder for these (e.g. `assets.storage_key_or_url`, `products.status`), it exists as a field only — no working feature is claimed.

### Requirement Coverage

| ID | Capability | How It Is Satisfied |
|---|---|---|
| CAT-01 | Categories | `categories` table with a self-referencing `parent_id`, a `UNIQUE` `slug`, and an `is_active` flag; cycle prevention (a category cannot become its own ancestor) is enforced in the service layer before any insert or update |
| CAT-02 | Product identity | `products` table with `name`, `UNIQUE` `slug`, `description`, `status`, `category_id` FK, and a JSONB `specifications` field for fabric, fit, and care instructions |
| CAT-03 | Variants and SKUs | `variants` groups a product by color; each `sku` under a variant has a `UNIQUE` `sku_code`, its own `price`, its own `size`, and its own `stock_quantity` |
| CAT-04 | Variant combinations | A size/color combination that is not sellable is simply never inserted as a `skus` row — no placeholder or zero-stock row is created for it |
| CAT-05 | Data integrity | `UNIQUE` and `CHECK` constraints live on the database itself (Section 5), not only in API validation |
| CAT-06 | Administrative access | Every admin route runs `authenticate` (valid JWT) then `requireRole('admin')`; missing or invalid tokens get `401`, non-admin tokens get `403` |
| CAT-07 | Wishlist | `wishlist_items` table links users to products; a user cannot add the same product twice (`UNIQUE(user_id, product_id)`) |
| CAT-08 | Reviews schema | `reviews` table is created this sprint; the write endpoint is deferred to Sprint 3 when the public storefront exists |

---

## 2. Link to Sprint 1 Decisions

This sprint extends — rather than replaces — the architecture defined in [`docs/SPRINT_1.md`](./SPRINT_1.md). That document remains the source of truth for the target audience, MVP scope, and tech-stack justification; none of it is re-argued here.

**Original Sprint 1 entities retained in the extended model, structurally unchanged:** `USERS`, `CARTS`, `ORDERS`, `ORDER_ITEMS` (kept so the ERD extends Sprint 1 rather than replacing it — see Section 3).

**Changed or added this sprint:**
- `CATEGORIES` gains a self-referencing `parent_id` to support a two-level tree structure (Sprint 1 showed a flat list)
- `PRODUCTS` gains a `specifications` JSONB field (fabric, fit, care_instructions) and a `slug` unique column
- `PRODUCTS` is enriched with `VARIANTS` (color grouping) and `SKUS` (the sellable unit — a specific size within that color, with its own price and stock)
- `CART_ITEMS.product_id` is changed to `CART_ITEMS.sku_id` so a cart line captures the exact size and color chosen, consistent with `ORDER_ITEMS`
- New: `ASSETS` table (image metadata only — no upload logic yet)
- New: `REVIEWS` table (schema only — write endpoint deferred)
- New: `WISHLIST_ITEMS` table (schema + admin-visible; customer write endpoint deferred to Sprint 3)
- New: migration tooling, seed scripts, and an automated test suite

---

## 3. Updated ERD and Data Dictionary

### Design Note on Variants vs. SKUs
For S&P Clovers a **Variant** represents one color grouping for a product, and a **SKU** represents the fully sellable unit — a specific size within that color, with its own price and stock. Example: Product *"Slim Fit Oxford Shirt"* → Variant *"Navy Blue"* → SKUs *Navy Blue / S*, *Navy Blue / M*, *Navy Blue / L* (each with its own stock count and price).

### Design Note on Cart_Items → SKUs
Cart_Items links to SKUS instead of directly to PRODUCTS because a cart line must capture "Navy Blue, size M," not just "this shirt." ORDER_ITEMS already references SKUS in the same way, so this keeps cart and order lines structurally consistent. Making this change before any cart code exists avoids rewriting the migration, API, and tests in a later sprint.

### Mermaid ER Diagram

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--|| CARTS : owns
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ WISHLIST_ITEMS : saves
    CARTS ||--o{ CART_ITEMS : holds
    CATEGORIES ||--o{ CATEGORIES : has_subcategories
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ VARIANTS : has
    VARIANTS ||--o{ SKUS : materializes
    PRODUCTS ||--o{ ASSETS : displays
    VARIANTS ||--o{ ASSETS : displays
    SKUS ||--o{ CART_ITEMS : selected_as
    PRODUCTS ||--o{ REVIEWS : receives
    PRODUCTS ||--o{ WISHLIST_ITEMS : saved_as
    SKUS ||--o{ ORDER_ITEMS : sold_as
    ORDERS ||--|{ ORDER_ITEMS : contains

    USERS {
        int id PK
        string full_name
        string email UK
        string password_hash
        string phone
        string role
        timestamp created_at
    }

    CATEGORIES {
        int id PK
        int parent_id FK "nullable, self-referencing"
        string name
        string slug UK
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    PRODUCTS {
        int id PK
        int category_id FK
        string name
        string slug UK
        string description
        string status "draft | published | archived"
        jsonb specifications "fabric, fit, care_instructions"
        timestamp created_at
        timestamp updated_at
    }

    VARIANTS {
        int id PK
        int product_id FK
        string color
        timestamp created_at
    }

    SKUS {
        int id PK
        int variant_id FK
        string size
        string sku_code UK
        decimal price
        int stock_quantity
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    ASSETS {
        int id PK
        int product_id FK "nullable"
        int variant_id FK "nullable"
        string storage_key_or_url
        string role "main | gallery | thumbnail"
        string alt_text
        int sort_order
    }

    REVIEWS {
        int id PK
        int product_id FK
        int user_id FK
        int rating "1-5"
        string comment
        timestamp created_at
    }

    WISHLIST_ITEMS {
        int id PK
        int user_id FK
        int product_id FK
        timestamp added_at
    }

    CARTS {
        int id PK
        int user_id FK UK
        timestamp created_at
    }

    CART_ITEMS {
        int id PK
        int cart_id FK
        int sku_id FK
        int quantity
        timestamp added_at
    }

    ORDERS {
        int id PK
        int user_id FK
        decimal total_amount
        string status
        string shipping_address
        string tracking_number
        timestamp created_at
    }

    ORDER_ITEMS {
        int id PK
        int order_id FK
        int sku_id FK
        int quantity
        decimal unit_price
    }
```

### Data Dictionary — Cardinality and Foreign Key Policies

| Relationship | Cardinality | ON DELETE | ON UPDATE | Reasoning |
|---|---|---|---|---|
| Category → Category (parent_id) | 1 : N (self) | SET NULL | CASCADE | Deleting a parent promotes its children to root level rather than destroying them |
| Category → Products | 1 : N | RESTRICT | CASCADE | Cannot delete a category that still has products; must reassign or archive them first |
| Product → Variants | 1 : N | CASCADE | CASCADE | A color variant has no meaning without its parent product |
| Variant → SKUs | 1 : N | CASCADE | CASCADE | A size SKU has no meaning without its parent color variant |
| Product / Variant → Assets | 1 : N (nullable FK on either side) | CASCADE | CASCADE | Asset metadata is meaningless once its owner is gone |
| Product → Reviews | 1 : N | CASCADE | CASCADE | Reviews are tied to product identity |
| Product → Wishlist_Items | 1 : N | CASCADE | CASCADE | A wishlist entry for a deleted product is meaningless |
| User → Reviews | 1 : N | CASCADE | CASCADE | A review has no independent meaning once the author's account is gone |
| User → Wishlist_Items | 1 : N | CASCADE | CASCADE | Wishlist belongs to the user |
| SKU → Cart_Items | 1 : N | RESTRICT | CASCADE | A SKU referenced by an active cart line must not be deleted; also ensures the cart line correctly identifies the size and color |
| Cart → Cart_Items | 1 : N | CASCADE | CASCADE | Cart line items have no meaning once the cart itself is gone |
| SKU → Order_Items | 1 : N | RESTRICT | CASCADE | Order history must remain intact even if a SKU is later deactivated |
| Orders → Order_Items | 1 : N | CASCADE | CASCADE | Order line items have no meaning once the parent order is gone |
| User → Orders | 1 : N | RESTRICT | CASCADE | Preserve order history; users are deactivated rather than hard-deleted |
| User → Cart | 1 : 1 | CASCADE | CASCADE | A cart is meaningless without its owner |

**Money representation:** `DECIMAL(10,2)` on `skus.price`, `orders.total_amount`, and `order_items.unit_price` — no floating-point currency anywhere in the system.

**API money convention:** every monetary field is sent and received as a **string** in both requests and responses — e.g. `"1299.00"` — never as a JSON number. JSON numbers lose precision the moment JavaScript handles them on the frontend. Keeping money as a string end-to-end prevents floating-point math errors on prices.

**Stock protection:** `CHECK (stock_quantity >= 0)` on `skus.stock_quantity` is enforced at the database level as the primary guard, with application-layer validation as a second line of defense.

**Wishlist uniqueness:** `UNIQUE(user_id, product_id)` on `wishlist_items` prevents a user from adding the same product to their wishlist more than once.

**Review rating:** `CHECK (rating BETWEEN 1 AND 5)` on `reviews.rating` enforced at the database level.

---

## 4. Administration Route Table (with Examples)

All routes require a valid JWT with `role = 'admin'`. Unauthenticated or non-admin requests receive `401` or `403` respectively.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/auth/login` | Admin login, returns JWT |
| POST | `/api/v1/admin/categories` | Create a category |
| GET | `/api/v1/admin/categories` | Return the full category list |
| PATCH | `/api/v1/admin/categories/:id` | Update name, slug, parent, or active status |
| DELETE | `/api/v1/admin/categories/:id` | Soft-deactivate a category (is_active = false) |
| POST | `/api/v1/admin/products` | Create a draft product |
| GET | `/api/v1/admin/products` | Return admin product records with category name |
| PATCH | `/api/v1/admin/products/:id` | Update product content or status |
| DELETE | `/api/v1/admin/products/:id` | Archive product (status = 'archived') |
| POST | `/api/v1/admin/products/:id/variants` | Add a color variant to a product |
| POST | `/api/v1/admin/products/:id/skus` | Add a size SKU to a variant |
| PATCH | `/api/v1/admin/skus/:id` | Update price, stock, or active status |
| DELETE | `/api/v1/admin/skus/:id` | Soft-deactivate a SKU |

### Example — Admin Login

**Request**
```
POST /api/v1/auth/login
Content-Type: application/json

{"email":"admin@spclovers.local","password":"Admin@12345"}
```

**Response — 200 OK**
```json
{"token":"<JWT>"}
```

### Example — Create Category

**Request**
```
POST /api/v1/admin/categories
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{"name":"Shirts","slug":"shirts","parent_id":1}
```

**Response — 201 Created**
```json
{
  "id": 2,
  "parent_id": 1,
  "name": "Shirts",
  "slug": "shirts",
  "is_active": true,
  "created_at": "2026-10-01T10:00:00.000Z"
}
```

**Response — 400 Bad Request (slug already exists)**
```json
{"error": "category slug already exists"}
```

**Response — 400 Bad Request (cycle detected)**
```json
{"error": "category cannot become its own ancestor"}
```

### Example — Create Product

**Request**
```
POST /api/v1/admin/products
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "name": "Slim Fit Oxford Shirt",
  "slug": "slim-fit-oxford-shirt",
  "description": "A breathable 100% cotton slim-fit shirt, perfect for casual and semi-formal wear.",
  "status": "draft",
  "category_id": 2,
  "specifications": {"fabric":"cotton","fit":"slim","care_instructions":"machine wash cold"}
}
```

**Response — 201 Created**
```json
{
  "id": 5,
  "name": "Slim Fit Oxford Shirt",
  "slug": "slim-fit-oxford-shirt",
  "category_id": 2,
  "status": "draft",
  "created_at": "2026-10-01T10:05:00.000Z"
}
```

**Response — 409 Conflict (duplicate slug)**
```json
{"error": "product slug already exists"}
```

### Example — Add Color Variant

**Request**
```
POST /api/v1/admin/products/5/variants
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{"color":"Navy Blue"}
```

**Response — 201 Created**
```json
{
  "id": 9,
  "product_id": 5,
  "color": "Navy Blue",
  "created_at": "2026-10-01T10:08:00.000Z"
}
```

**Response — 400 Bad Request (same color already exists for this product)**
```json
{"error": "color variant already exists for this product"}
```

### Example — Add Size SKU

**Request**
```
POST /api/v1/admin/products/5/skus
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "variant_id": 9,
  "size": "M",
  "sku_code": "SHT-NVY-M",
  "price": "1299.00",
  "stock_quantity": 30
}
```

**Response — 201 Created**
```json
{
  "id": 14,
  "variant_id": 9,
  "size": "M",
  "sku_code": "SHT-NVY-M",
  "price": "1299.00",
  "stock_quantity": 30,
  "is_active": true
}
```

**Response — 409 Conflict (duplicate SKU code)**
```json
{"error": "SKU code already exists"}
```

**Response — 401 Unauthorized**
```json
{"error": "Authentication required"}
```

**Response — 403 Forbidden (non-admin token)**
```json
{"error": "Administrator access required"}
```

### Example — Update / Deactivate Category

**Request**
```
PATCH /api/v1/admin/categories/3
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{"is_active": false}
```

**Response — 200 OK**
```json
{
  "id": 3,
  "name": "Pants",
  "slug": "pants",
  "parent_id": 1,
  "is_active": false
}
```

---

## 5. Data Integrity and Authorization Decisions

### Authorization
Every admin route runs an `authenticate` middleware that validates the JWT, followed by `requireRole('admin')`. No token → `401`. Valid but non-admin token → `403`. Both paths are covered by automated tests (Section 7).

### Data Integrity Enforcement (database level, not just the API)
- `categories.slug`, `products.slug`, and `skus.sku_code` carry `UNIQUE` constraints
- `skus.stock_quantity` carries `CHECK (stock_quantity >= 0)` — negative stock is physically impossible
- `skus.price` carries `CHECK (price >= 0)` — non-negative price enforced at DB level
- `UNIQUE (variant_id, size)` on `skus` — prevents two SKUs from representing the same size within the same color variant (e.g. two "Navy Blue, M" rows)
- `UNIQUE (product_id, color)` on `variants` — prevents the same product from having two identical color variants
- `UNIQUE (user_id, product_id)` on `wishlist_items` — a user cannot wishlist the same product twice
- `reviews.rating` carries `CHECK (rating BETWEEN 1 AND 5)` — invalid star ratings are rejected at the DB level
- Every foreign key has an explicit `ON DELETE` / `ON UPDATE` policy — none are left at database defaults
- Category cycle prevention is enforced in the service layer (walking the proposed parent chain and rejecting if the target category's own ID appears in it), since this logic cannot be expressed as a plain SQL constraint — it is covered by an automated test

### Specification Field
`products.specifications` is `JSONB`, validated in the API layer before insert or update: only the keys `fabric`, `fit`, and `care_instructions` are accepted, all with string values. Unknown keys or non-object payloads are rejected with `422`. A `CHECK (jsonb_typeof(specifications) = 'object')` constraint backs this at the database level.

### Business Rules Applied to the Data Model
- A draft product may exist with zero SKUs; a status change to `published` is rejected unless at least one active SKU exists.
- Each product belongs to exactly one category (`category_id`) — no many-to-many junction table, since the S&P Clovers catalog does not require cross-category tagging.
- Deactivating a parent category only flips that category's own `is_active` flag; child categories are not auto-deactivated. **Public visibility rule (decided now, for Sprint 3):** a category and all its products are shown to customers only when the category and every one of its ancestors are active. This is computed at read time, not stored as a duplicate flag, so reactivating a parent instantly makes its children visible again without touching child rows.
- An out-of-stock SKU is still returned in API responses with a computed `available: false` flag — never deleted or hidden outright.
- **Price sharing and price overrides:** Yes, two SKUs can share the same price — `price` is an independent `DECIMAL(10,2)` column on each `skus` row with no uniqueness constraint. There is no separate "price override" feature; a size-level price difference (e.g. a 3XL shirt costs more than a Medium) is expressed simply by setting a different `price` value on that SKU. All prices are returned as strings (e.g. `"1299.00"`) to avoid floating-point precision loss in JavaScript.
- What prevents negative stock and duplicate SKU codes: `CHECK (stock_quantity >= 0)` and `UNIQUE (sku_code)` are enforced at the database level. Application-layer validation catches these before the query is even sent, providing a fast, friendly error response rather than a raw DB constraint violation.
- A product or SKU referenced by any `cart_items` or `order_items` row is never hard-deleted — the `RESTRICT` policy on those foreign keys enforces this physically, and soft deactivation is used instead.
- Reviews exist in the schema now; the customer-facing write endpoint is deferred to Sprint 3.
- Wishlist schema is created; customer endpoints are deferred to Sprint 3.

---

## 6. Seed Data and Demonstration Instructions

Seed data is provided via a reproducible script (`npm run seed`), runnable against a clean database:

- **Admin user:** `admin@spclovers.local` / `Admin@12345`
- **Category tree (2 levels):** `Clothing` → `Shirts`, `Pants`
- **Products (3, one with multiple variants):**
  1. *Slim Fit Oxford Shirt* (Shirts) — variants: **White**, **Navy Blue**
  2. *Classic Chino Pants* (Pants) — variant: **Khaki**
  3. *Relaxed Denim Pants* (Pants) — variant: **Indigo**
- **SKUs (4 valid, plus one intentionally unavailable combination):**
  - `SHT-WHT-M`, `SHT-WHT-L`, `SHT-NVY-M`, `PNT-KHK-32` — valid, in stock
  - *Slim Fit Oxford Shirt / Navy Blue / XXL* — deliberately **not created** as a row (per CAT-04, never faked as a zero-stock SKU)

### Seed Data Tables

**Categories**

| Name | Slug | Parent |
|---|---|---|
| Clothing | `clothing` | None |
| Shirts | `shirts` | Clothing |
| Pants | `pants` | Clothing |

**Products**

| Product | Slug | Category | Status |
|---|---|---|---|
| Slim Fit Oxford Shirt | `slim-fit-oxford-shirt` | Shirts | published |
| Classic Chino Pants | `classic-chino-pants` | Pants | published |
| Relaxed Denim Pants | `relaxed-denim-pants` | Pants | draft |

**Valid Variants and SKUs**

| Product | Color | SKU Code | Size | Price | Stock | Active |
|---|---|---|---|---:|---:|---|
| Slim Fit Oxford Shirt | White | `SHT-WHT-M` | M | 1299.00 | 25 | Yes |
| Slim Fit Oxford Shirt | White | `SHT-WHT-L` | L | 1299.00 | 18 | Yes |
| Slim Fit Oxford Shirt | Navy Blue | `SHT-NVY-M` | M | 1349.00 | 30 | Yes |
| Classic Chino Pants | Khaki | `PNT-KHK-32` | 32 | 1899.00 | 15 | Yes |

**Intentionally Unavailable Combination**

*Slim Fit Oxford Shirt / Navy Blue / XXL* is intentionally not created as a SKU row. This demonstrates CAT-04: a missing combination is never represented as a fake zero-stock SKU — it is simply absent from the table.

### Demonstration Steps
1. `npm run migrate`
2. `npm run seed`
3. Authenticate as admin (`POST /api/v1/auth/login`) to obtain a JWT
4. `POST /api/v1/admin/categories` → confirm via `GET /api/v1/admin/categories`
5. `POST /api/v1/admin/products` → create a product under an existing category
6. `POST /api/v1/admin/products/:id/variants` → add a color variant
7. `POST /api/v1/admin/products/:id/skus` → add a size SKU, confirm the response
8. Attempt a duplicate SKU code and a negative stock value — confirm both return `400`
9. Attempt `GET /api/v1/admin/products` without a token — confirm `401`

### API Evidence (Captured Locally)

Environment: Local PostgreSQL, Node.js 18+, S&P Clovers API on http://localhost:3000

#### 1. Login (POST /api/v1/auth/login)

Request Body:
`{"email":"admin@spclovers.local","password":"Admin@12345"}`

Response (200):
`{"token":"<JWT>"}`

#### 2. Get Categories (GET /api/v1/admin/categories)

Response (200):
```json
[
  {"id":1,"parent_id":null,"name":"Clothing","slug":"clothing","is_active":true},
  {"id":2,"parent_id":1,"name":"Shirts","slug":"shirts","is_active":true},
  {"id":3,"parent_id":1,"name":"Pants","slug":"pants","is_active":true}
]
```

#### 3. Create Category (POST /api/v1/admin/categories)

Request Body:
`{"name":"Outerwear","slug":"outerwear","parent_id":1}`

Response (201):
```json
{"id":4,"parent_id":1,"name":"Outerwear","slug":"outerwear","is_active":true,"created_at":"2026-10-01T17:00:00.000Z"}
```

#### 4. Create Product (POST /api/v1/admin/products)

Request Body:
`{"name":"Sprint Demo Shirt","slug":"sprint-demo-shirt","description":"Demo for evidence","status":"draft","category_id":4,"specifications":{"fabric":"polyester","fit":"regular","care_instructions":"hand wash only"}}`

Response (201):
```json
{"id":4,"category_id":4,"name":"Sprint Demo Shirt","slug":"sprint-demo-shirt","status":"draft","created_at":"2026-10-01T17:02:00.000Z"}
```

#### 5. Create Variant (POST /api/v1/admin/products/4/variants)

Request Body:
`{"color":"Olive Green"}`

Response (201):
```json
{"id":5,"product_id":4,"color":"Olive Green","created_at":"2026-10-01T17:03:00.000Z"}
```

#### 6. Create SKU (POST /api/v1/admin/products/4/skus)

Request Body:
`{"variant_id":5,"size":"L","sku_code":"DEMO-SHT-OLV-L","price":"999.00","stock_quantity":12,"is_active":true}`

Response (201):
```json
{"id":5,"variant_id":5,"size":"L","sku_code":"DEMO-SHT-OLV-L","price":"999.00","stock_quantity":12,"is_active":true,"created_at":"2026-10-01T17:04:00.000Z"}
```

#### 7. Get Products (GET /api/v1/admin/products) — Final Verify

Response (200):
```json
[
  {"id":4,"name":"Sprint Demo Shirt","status":"draft","category_name":"Outerwear"}
]
```

#### 8. Update Product (PATCH /api/v1/admin/products/:id)

Request Body:
`{"status":"published","description":"Updated description for the sprint demo shirt."}`

Response (200):
```json
{"id":4,"name":"Sprint Demo Shirt","slug":"sprint-demo-shirt","status":"published","category_id":4,"updated_at":"2026-10-01T17:10:00.000Z"}
```

#### 9. Update SKU (PATCH /api/v1/admin/skus/:id)

Request Body:
`{"price":1099.00,"stock_quantity":8}`

Response (200):
```json
{"id":5,"variant_id":5,"size":"L","sku_code":"DEMO-SHT-OLV-L","price":"1099.00","stock_quantity":8,"is_active":true,"updated_at":"2026-10-01T17:11:00.000Z"}
```

---

## 7. Test Strategy, Command, and Result

**Framework:** Jest (test runner) + Supertest (HTTP assertions against the Express app) + pg-mem (in-memory PostgreSQL — no real database needed for tests).

**Command:** `npm test`

| Test Area | What Is Verified |
|---|---|
| Category and product creation | Successful creation returns `201` with all required fields |
| Duplicate slug rejection | A second product or category with an existing slug returns `400`, not a server error |
| Duplicate SKU rejection | A second SKU with an existing `sku_code` returns `400` |
| Duplicate color variant rejection | A second variant with the same color for the same product returns `400` |
| Category cycle prevention | Setting a category's `parent_id` to one of its own descendants is rejected with `400` |
| Stock and price rules | A SKU cannot be created with `stock_quantity < 0` or `price < 0` |
| Authorization | Admin routes reject requests with no token (`401`) and requests with a non-admin token (`403`) |

**Result:**
```text
Test command:
npm test

Result:
PASS  tests/sprint2.test.js

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        1.912 s
```

---

## 8. Known Limitations and Sprint 3 Backlog

**Known limitations (by design, within this sprint's scope):**
- No image or file upload exists — `assets.storage_key_or_url` is a plain string field with no upload pipeline behind it.
- No public-facing (non-admin) catalog read endpoints exist — everything built this sprint is admin-only.
- Reviews and Wishlist schemas exist in the database, but customer-facing write and read endpoints are not yet implemented.
- Specifications are validated against a small fixed schema (fabric, fit, care_instructions); a fully dynamic admin-configurable specification system is deferred.
- No size-chart or measurement guide table yet.

**Sprint 3 backlog:**
- Public catalog browse and search endpoints (customer-facing), implementing the ancestor-chain category visibility rule from Section 5
- Customer cart endpoints (add to cart by SKU, update quantity, remove item)
- Checkout and order placement flow
- Customer review submission and retrieval endpoints
- Customer wishlist add, remove, and list endpoints
- Asset upload pipeline (actual file storage, not just metadata)
- Publication workflow — what "published" status fully unlocks on the storefront
- Dynamic, admin-configurable specification fields
