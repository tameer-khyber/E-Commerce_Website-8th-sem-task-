# Sprint 2: Catalog Data Foundation
### Project: S&P Clovers — Online Store for Shirts & Pants

## 1. Sprint Goal and Scope Boundary

This sprint delivers a relational catalog database and an authenticated admin API that reliably store categories, products, variants, and SKUs — preserving identity, relationships, pricing, and inventory accuracy so that Sprint 3's storefront, cart, and checkout can build on top of it without re-modeling the data.

**What this sprint delivers:** a category tree (self-referencing `parent_id` + unique slugs), product records split across `products` / `variants` / `skus`, admin-only authenticated CRUD endpoints, database-enforced constraints (Section 5), migration files, reproducible seed data, and an automated test suite.

**Deferred to later sprints:** a dynamic specification editor, an image-upload pipeline, public catalog search, publish-workflow automation, payments, shipping, and the shopper checkout flow. Where the data model needs a placeholder for these (e.g. `assets.storage_key_or_url`, `products.status`), it exists as a field only — no working feature is claimed.

### Requirement Coverage

| ID | Capability | How I Satisfied It |
|---|---|---|
| CAT01 | Categories | `categories` table with a self-referencing `parent_id`, a `UNIQUE` `slug`, and an `is_active` flag; cycle prevention (a category can't become its own ancestor) is checked in the service layer before insert/update |
| CAT02 | Product identity | `products` table with `name`, `UNIQUE slug`, `description`, `status`, and `category_id` FK |
| CAT03 | Variants and SKUs | `variants` groups a product by color; each `sku` under a variant has a `UNIQUE sku_code`, its own `price`, and its own `stock_quantity` |
| CAT04 | Variant combinations | A size/color combination that isn't sellable is simply never inserted as a `skus` row — no placeholder or zero-stock row is created for it |
| CAT05 | Data integrity | `UNIQUE` and `CHECK` constraints live on the database itself (Section 5), not only in API validation |
| CAT06 | Administrative access | Every admin route runs `authenticate` (valid JWT) then `requireRole('admin')`; missing/invalid tokens get `401`, non-admin tokens get `403` |

---

## 2. Link to Sprint 1 Decisions

This sprint extends — rather than replaces — the architecture defined in [`docs/SPRINT_1.md`](./SPRINT_1.md). That document remains the source of truth for the target audience, MVP scope, and tech-stack justification; none of it is re-argued here.

**Original Sprint 1 entities retained in the extended model, structurally unchanged:** `USERS`, `CART`, `ORDERS`, `ORDER_ITEMS`, `REVIEWS` (kept so the ERD extends Sprint 1 rather than replacing it — see Section 3).

**Changed/added this sprint:**
- `CATEGORIES` gains a self-referencing `parent_id` to support a tree structure (Sprint 1 only had a flat list)
- `PRODUCTS` is split into `PRODUCTS` (identity/description) + `VARIANTS` (option grouping) + `SKUS` (sellable unit with price/stock)
- `CART_ITEMS.product_id` is changed to `CART_ITEMS.sku_id`, so a cart line can identify the exact size/color chosen, consistent with `ORDER_ITEMS` (see Section 3 design note)
- New: `ASSETS` table (image/media metadata only — no file upload logic yet)
- New: migration tooling, seed scripts, and an automated test suite (none of these were deliverables in Sprint 1)

---

## 3. Updated ERD and Data Dictionary

### Design note on Variants vs. SKUs
For S&P Clovers, a **Variant** represents one grouping option (color) for a product, and a **SKU** represents the fully sellable unit (a specific size within that color, with its own price and stock). Example: Product *"Classic White Shirt"* → Variant *"Blue"* → SKUs *Blue/S*, *Blue/M*, *Blue/L* (each with its own stock and price).

### Design note on Cart_Items → SKUs (deviation from the manual's sample diagram)
The manual's sample diagram links `PRODUCTS` directly to `CART_ITEMS`. This project links **`CART_ITEMS` to `SKUS`** instead: a cart line has to be able to say "Blue, size M," not just "this shirt," or checkout has no way to know which size/color the customer meant. `ORDER_ITEMS` already references `SKUS` in the manual's own diagram, so this keeps cart and order lines consistent with each other. Making this change now — before any cart code exists — avoids rewriting the migration, API, and tests later.

### Mermaid ER Diagram

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--|| CART : owns
    USERS ||--o{ REVIEWS : writes
    CART ||--o{ CART_ITEMS : holds
    CATEGORIES ||--o{ CATEGORIES : has_subcategories
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ VARIANTS : has
    VARIANTS ||--o{ SKUS : materializes
    PRODUCTS ||--o{ ASSETS : displays
    VARIANTS ||--o{ ASSETS : displays
    SKUS ||--o{ CART_ITEMS : selected_as
    PRODUCTS ||--o{ REVIEWS : receives
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
        string status "draft | published | inactive"
        jsonb specifications "validated, see Section 5"
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

    CART {
        int id PK
        int user_id FK UK
    }

    CART_ITEMS {
        int id PK
        int cart_id FK
        int sku_id FK
        int quantity
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

    REVIEWS {
        int id PK
        int product_id FK
        int user_id FK
        int rating
        string comment
        timestamp created_at
    }
```

### Data Dictionary — Cardinality and Foreign Key Policies

| Relationship | Cardinality | ON DELETE | ON UPDATE | Reasoning |
|---|---|---|---|---|
| Category → Category (parent_id) | 1 : N (self) | SET NULL | CASCADE | Deleting a parent promotes children to top-level rather than destroying them |
| Category → Products | 1 : N | RESTRICT | CASCADE | Cannot delete a category that still has products; must reassign or deactivate first |
| Product → Variants | 1 : N | CASCADE | CASCADE | A variant has no meaning without its parent product |
| Variant → SKUs | 1 : N | CASCADE | CASCADE | A SKU has no meaning without its parent variant |
| Product/Variant → Assets | 1 : N (nullable FK on either side) | CASCADE | CASCADE | Asset metadata is meaningless once its owner is gone |
| SKU → Cart_Items | 1 : N | RESTRICT | CASCADE | A SKU referenced by an active cart line must not be deletable; also lets a cart line correctly identify the size/color chosen |
| Cart → Cart_Items | 1 : N | CASCADE | CASCADE | Cart line items have no meaning once the cart itself is gone |
| SKU → Order_Items | 1 : N | RESTRICT | CASCADE | Order history must remain intact even if a SKU is later deactivated |
| Orders → Order_Items | 1 : N | CASCADE | CASCADE | Order line items have no meaning once the order itself is gone |
| User → Orders | 1 : N | RESTRICT | CASCADE | Preserve order history; users are deactivated, not hard-deleted |
| User → Cart | 1 : 1 | CASCADE | CASCADE | A cart is meaningless without its owner |
| Product → Reviews | 1 : N | CASCADE | CASCADE | Reviews are tied to product identity |
| User → Reviews | 1 : N | CASCADE | CASCADE | A review has no independent meaning once its author's account is gone |

**Money representation:** `DECIMAL(10,2)` on `skus.price`, `orders.total_amount`, and `order_items.unit_price` — no floating-point currency anywhere.

**API money convention:** every monetary field (`price`, `total_amount`, `unit_price`) is sent and received as a **string** — e.g. `"1499.00"` — in both requests and responses, never as a JSON number. JSON numbers lose precision on the frontend the moment JavaScript touches them; keeping money as a string end-to-end means the frontend never does floating-point math on prices. This convention applies consistently across every admin endpoint (see the SKU example below).

**Stock protection:** `CHECK (stock_quantity >= 0)` on `skus.stock_quantity`, enforced at the database level as the primary guard, with application logic as a second line of defense.

---

## 4. Administration Route Table (with Examples)

All routes require a valid JWT with `role = 'admin'`. Unauthenticated or non-admin requests receive `401` or `403` respectively.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/admin/categories` | Create a category |
| GET | `/api/v1/admin/categories` | Return the category tree |
| PATCH | `/api/v1/admin/categories/:id` | Update a category's name, slug, parent, or active status |
| POST | `/api/v1/admin/products` | Create a draft product |
| PATCH | `/api/v1/admin/products/:id` | Update product content or status |
| GET | `/api/v1/admin/products` | Return administrative product records |
| POST | `/api/v1/admin/products/:id/variants` | Add a variant to a product |
| POST | `/api/v1/admin/variants/:id/skus` | Add a validated SKU to a variant |
| PATCH | `/api/v1/admin/skus/:id` | Update price, stock, or active status |

### Example — Create Product

**Request**
```
POST /api/v1/admin/products
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "name": "Classic White Shirt",
  "category_id": 2,
  "description": "A breathable cotton casual shirt.",
  "status": "draft",
  "specifications": { "fabric": "cotton", "fit": "regular" }
}
```

**Response — 201 Created**
```json
{
  "id": 14,
  "name": "Classic White Shirt",
  "slug": "classic-white-shirt",
  "category_id": 2,
  "status": "draft",
  "created_at": "2026-09-29T10:00:00Z"
}
```

**Response — 409 Conflict (duplicate slug)**
```json
{ "error": "DUPLICATE_SLUG", "message": "A product with this slug already exists." }
```

### Example — Add SKU

**Request**
```
POST /api/v1/admin/variants/7/skus
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "size": "M",
  "sku_code": "CWS-BLU-M",
  "price": "1499.00",
  "stock_quantity": 25
}
```

**Response — 201 Created**
```json
{
  "id": 31,
  "variant_id": 7,
  "size": "M",
  "sku_code": "CWS-BLU-M",
  "price": "1499.00",
  "stock_quantity": 25,
  "is_active": true
}
```

**Response — 409 Conflict (duplicate SKU code)**
```json
{ "error": "DUPLICATE_SKU_CODE", "message": "This SKU code is already in use." }
```

**Response — 401 Unauthorized (missing/invalid token)**
```json
{ "error": "UNAUTHENTICATED", "message": "A valid admin token is required." }
```

### Example — Update / Deactivate Category

**Request**
```
PATCH /api/v1/admin/categories/5
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{ "is_active": false }
```

**Response — 200 OK**
```json
{
  "id": 5,
  "name": "Pants",
  "slug": "pants",
  "parent_id": 1,
  "is_active": false
}
```

**Response — 400 Bad Request (attempted cycle: setting parent_id to a descendant)**
```json
{ "error": "INVALID_PARENT", "message": "A category cannot become its own descendant's child." }
```

---

## 5. Data Integrity and Authorization Decisions

### Authorization
Every admin route runs an `authenticate` middleware (validates the JWT) followed by `requireRole('admin')`. No token → `401`. Valid but non-admin token → `403`. Both paths are covered by automated tests (Section 7).

### Data Integrity Enforcement (database level, not just the API)
- `categories.slug`, `products.slug`, and `skus.sku_code` carry `UNIQUE` constraints
- `skus.stock_quantity` carries `CHECK (stock_quantity >= 0)`
- `UNIQUE (variant_id, size)` on `skus` — prevents two SKUs from representing the same size within the same color variant (e.g. two "Blue, M" rows)
- `UNIQUE (product_id, color)` on `variants` — prevents the same product from having two identical color variants
- Every foreign key in Section 3 has an explicit `ON DELETE` / `ON UPDATE` policy — none left at the database default
- Category cycle prevention is enforced in the service layer (walking the proposed parent chain and rejecting if the target category's own ID appears in it), since this logic can't be expressed as a plain SQL constraint — it's covered by an automated test instead

### Specification Field
`products.specifications` is `JSONB`, validated against a fixed schema (`fabric`, `fit`, `care_instructions` — string values only) via `ajv` before insert/update; unknown keys or non-object payloads are rejected with `422`. A `CHECK (jsonb_typeof(specifications) = 'object')` constraint backs this at the database level.

### Business Rules Applied to the Data Model
- A draft product may exist with zero SKUs; a status change to `published` is rejected unless at least one active SKU exists.
- Each product belongs to exactly one category (`category_id`) — no many-to-many junction table, since this catalog's scale doesn't need it.
- Deactivating a parent category only flips that category's own `is_active` flag; child categories are not auto-deactivated, avoiding a destructive cascade. **Public catalog visibility rule (decided now, for Sprint 3's queries):** a category is shown to customers only if it **and every one of its ancestors** are active. A child keeps its own `is_active = true` in the database, but a public query walks up the parent chain and hides it if any ancestor is inactive. This is computed at read time rather than stored as a duplicate flag, so reactivating the parent instantly makes its children visible again without touching the children's rows.
- An out-of-stock SKU is still returned in API responses, carrying a computed `available: false` flag — never deleted or hidden outright.
- Price lives on the SKU rather than the Product, so two SKUs can validly share a price, and any SKU can carry its own override (e.g. a 3XL costing more than a Medium).
- `skus.sku_code` (`UNIQUE`) and `skus.stock_quantity` (`CHECK >= 0`) are enforced at the database level, not only in application code; a future checkout's stock decrement will run inside a transaction to avoid race conditions.
- A product or SKU referenced by any `cart_items` or `order_items` row is never hard-deleted — the `RESTRICT` policy on those foreign keys enforces this physically, and deactivation is a soft status/flag change instead.

---

## 6. Seed Data and Demonstration Instructions

Seed data is provided via a reproducible script (`npm run seed`), runnable against a clean database:

- **Category tree (2 levels):** `Clothing` → `Shirts`, `Pants`
- **Products (3, one with multiple variants):**
  1. *Classic White Shirt* (Shirts) — variants: **White**, **Blue**
  2. *Slim Fit Jeans* (Pants) — variant: **Dark Blue**
  3. *Casual Chinos* (Pants) — variant: **Khaki**
- **SKUs (4 valid, plus one intentionally unavailable combination):**
  - `CWS-WHT-S`, `CWS-WHT-M`, `CWS-BLU-M`, `SFJ-DKB-32` — valid, in stock
  - *Classic White Shirt / Blue / XXL* — deliberately **not created** as a row at all (per CAT04, never faked as a zero-stock SKU)

### Demonstration Steps
1. `npm run migrate`
2. `npm run seed`
3. Authenticate as admin (`POST /api/v1/auth/login`) to obtain a JWT
4. `POST /api/v1/admin/categories` → confirm via `GET /api/v1/admin/categories`
5. `POST /api/v1/admin/products` → create a product under that category
6. `POST /api/v1/admin/products/:id/variants` → add a variant
7. `POST /api/v1/admin/variants/:id/skus` → add a SKU, confirm response
8. Capture the above request/response pairs as evidence (tokens and private URLs redacted before committing)

---

## 7. Test Strategy, Command, and Result

**Framework:** Jest (test runner) + Supertest (HTTP assertions against the Express app).
**Command:** `npm test`

| Test Area | What Is Verified |
|---|---|
| Product/SKU creation | Successful creation with all required fields present |
| Duplicate slug rejection | A second product/category with an existing slug returns `409`, not a server error |
| Duplicate SKU rejection | A second SKU with an existing `sku_code` returns `409` |
| Category cycle prevention | Setting a category's `parent_id` to one of its own descendants is rejected |
| Stock/combination rules | A SKU cannot be created with `stock_quantity < 0`; a published product with zero SKUs is rejected |
| Authorization | Admin routes reject no-token requests (`401`) and non-admin tokens (`403`) |

**Result:** *(paste the actual `npm test` output here once the suite is implemented and run — e.g. "14 passed, 0 failed")*.

---

## 8. Known Limitations and Sprint 3 Backlog

**Known limitations (by design, within this sprint's scope):**
- No image/file upload exists — `assets.storage_key_or_url` is a plain string field with no upload pipeline behind it.
- No public-facing (non-admin) catalog read endpoints exist yet — everything built this sprint is admin-only. This includes the category-visibility rule in Section 5 (ancestor chain must all be active), which is decided now but has no live query implementing it yet.
- Specifications are a small fixed JSON schema (fabric, fit, care instructions), not a fully dynamic/admin-configurable system.

**Sprint 3 backlog:**
- Dynamic, admin-configurable specification fields
- Asset upload pipeline (actual file storage, not just metadata)
- Public catalog reads (customer-facing browse/search endpoints), implementing the ancestor-chain visibility rule from Section 5
- Publication rules — what "published" fully unlocks on the storefront
- Catalog-to-cart readiness — the schema is already SKU-precise (`Cart_Items → SKU`), so this is about wiring real cart/checkout logic on top, not remodeling data
