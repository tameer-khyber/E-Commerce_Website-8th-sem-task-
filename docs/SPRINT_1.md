# Sprint 1: System Architecture & Scope Definition

### Project: S&P Clovers — Online Store for Shirts & Pants

---

## Section 1: Target Audience & Market Focus

**Primary Persona**

Young adults and students (roughly ages 16–30) who shop casually online, are comfortable using a phone or laptop to buy clothes, and care about price, style, and a smooth checkout experience.

**Core Pain Point**

Many small clothing sellers only sell through Instagram or WhatsApp, which makes browsing, checkout, and order tracking messy. S&P Clovers solves this by giving customers one clean website where they can browse shirts and pants by size, color, and price; add items to a cart; and check out properly — without needing to message anyone manually.

**Domain Scope**

Apparel / Fashion — specifically casual men's and women's shirts and pants.

---

## Section 2: Minimum Viable Product (MVP) Feature Scope

| Category | Feature Name | Description | Priority |
|---|---|---|---|
| Authentication | User Registration & Login | Secure account creation and login with hashed passwords and JWT-based session tokens. | High (MVP) |
| Catalog | Product List & Search | Product browsing interface with size, color, and price filtering and keyword search. | High (MVP) |
| Cart | Cart Management | State-persistent cart with item addition, quantity modification, and removal. Each cart line captures the exact size and color chosen. | High (MVP) |
| Checkout | Order Processing | Mock or Stripe payment gateway integration and order object creation on confirmation. | High (MVP) |
| Admin | Inventory Control | Admin-only CRUD operations for managing products, color variants, size SKUs, and stock levels. | Medium |
| Reviews | Ratings & Comments | Verified-purchase customers can leave a star rating (1–5) and a written comment on any product. | High (MVP) |
| Wishlist | Save for Later | Authenticated users can add products to a personal wishlist and remove them at any time. | Medium |

The MVP is scoped to essential shopping workflows so a working e-commerce system can be delivered within the academic semester timeline.

---

## Section 3: Tech Stack Selection & Justification

**Frontend Framework: HTML, CSS & JavaScript**

Justification: Gives full control over markup and styling with zero build-tool overhead, which keeps the project manageable within an academic timeline. The UI can be migrated to a component framework such as React later, but that is not required to hit MVP scope. Vanilla JS keeps dependencies minimal and page load times fast for users on mobile data connections.

**Backend Infrastructure: Node.js with Express**

Justification: Node.js uses JavaScript on the server too, so one language runs across the whole stack. Express is lightweight and unopinionated, has strong ecosystem support, and ships mature packages for JWT authentication, Stripe payments, file uploads, and input validation — reducing implementation time versus a heavier framework like Spring Boot or Django.

**Database Management System: PostgreSQL**

Justification: The domain has fixed, predictable relationships — a user has many orders, an order has many items, a product has many color variants, and each color variant has many size SKUs — which favors a relational schema over a document store. PostgreSQL enforces referential integrity and precise decimal handling for prices, and is free and widely supported. MySQL is a viable alternative if hosting availability becomes a constraint.

**Caching & Asynchronous Processing (Optional): Redis**

Justification: Not required for MVP, but applicable later for session-based cart persistence across devices and for dispatching order-confirmation emails asynchronously so checkout requests are not blocked by email delivery latency.

---

## Section 4: Entity-Relationship Diagram (ERD)

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
    SKUS ||--o{ CART_ITEMS : selected_as
    PRODUCTS ||--o{ REVIEWS : receives
    PRODUCTS ||--o{ WISHLIST_ITEMS : saved_as
    SKUS ||--o{ ORDER_ITEMS : sold_as
    ORDERS ||--|{ ORDER_ITEMS : contains

    USERS {
        INTEGER id PK
        VARCHAR full_name
        VARCHAR email UK
        VARCHAR password_hash
        VARCHAR phone
        VARCHAR role
        TIMESTAMP created_at
    }

    CATEGORIES {
        INTEGER id PK
        INTEGER parent_id FK
        VARCHAR name
        VARCHAR slug UK
        BOOLEAN is_active
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    PRODUCTS {
        INTEGER id PK
        INTEGER category_id FK
        VARCHAR name
        VARCHAR slug UK
        TEXT description
        VARCHAR status
        JSONB specifications
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    VARIANTS {
        INTEGER id PK
        INTEGER product_id FK
        VARCHAR color
        TIMESTAMP created_at
    }

    SKUS {
        INTEGER id PK
        INTEGER variant_id FK
        VARCHAR size
        VARCHAR sku_code UK
        DECIMAL price
        INTEGER stock_quantity
        BOOLEAN is_active
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    ASSETS {
        INTEGER id PK
        INTEGER product_id FK
        INTEGER variant_id FK
        VARCHAR storage_key_or_url
        VARCHAR role
        VARCHAR alt_text
        INTEGER sort_order
    }

    REVIEWS {
        INTEGER id PK
        INTEGER product_id FK
        INTEGER user_id FK
        INTEGER rating
        TEXT comment
        TIMESTAMP created_at
    }

    WISHLIST_ITEMS {
        INTEGER id PK
        INTEGER user_id FK
        INTEGER product_id FK
        TIMESTAMP added_at
    }

    CARTS {
        INTEGER id PK
        INTEGER user_id FK UK
        TIMESTAMP created_at
    }

    CART_ITEMS {
        INTEGER id PK
        INTEGER cart_id FK
        INTEGER sku_id FK
        INTEGER quantity
        TIMESTAMP added_at
    }

    ORDERS {
        INTEGER id PK
        INTEGER user_id FK
        DECIMAL total_amount
        VARCHAR status
        VARCHAR shipping_address
        VARCHAR tracking_number
        TIMESTAMP created_at
    }

    ORDER_ITEMS {
        INTEGER id PK
        INTEGER order_id FK
        INTEGER sku_id FK
        INTEGER quantity
        DECIMAL unit_price
    }
```

**Attribute Data Type Reference (SQL-compliant)**

| Table | Attribute | SQL Type |
|---|---|---|
| Users | full_name, phone, role | VARCHAR(100), VARCHAR(20), VARCHAR(20) |
| Users | email | VARCHAR(150) UNIQUE |
| Users | password_hash | VARCHAR(255) |
| Categories | name | VARCHAR(100) |
| Categories | slug | VARCHAR(120) UNIQUE |
| Products | name | VARCHAR(150) |
| Products | slug | VARCHAR(170) UNIQUE |
| Products | description | TEXT |
| Products | status | VARCHAR(20) CHECK IN ('draft','published','archived') |
| Products | specifications | JSONB — keys: fabric, fit, care_instructions |
| Variants | color | VARCHAR(50) — e.g. White, Navy Blue, Charcoal |
| SKUs | size | VARCHAR(10) — e.g. XS, S, M, L, XL, XXL for shirts; 28, 30, 32, 34, 36 for pants |
| SKUs | sku_code | VARCHAR(50) UNIQUE — e.g. SHT-WHT-M, PNT-BLK-32 |
| SKUs | price | DECIMAL(10,2) |
| SKUs | stock_quantity | INTEGER CHECK >= 0 |
| Reviews | rating | INTEGER CHECK (rating BETWEEN 1 AND 5) |
| Reviews | comment | TEXT |
| Cart_Items / Order_Items | quantity | INTEGER CHECK > 0 |
| Orders / Order_Items | total_amount, unit_price | DECIMAL(10,2) |
| Orders | status | VARCHAR(20) — pending, paid, shipped, delivered, cancelled |
| Orders | shipping_address, tracking_number | VARCHAR(300), VARCHAR(60) |
| Assets | role | VARCHAR(20) — main, gallery, thumbnail |
| All created_at / updated_at | — | TIMESTAMPTZ DEFAULT NOW() |

**Relationships in Plain Words**

- One **User** can place many **Orders** (1 : N)
- One **User** has exactly one **Cart** (1 : 1)
- One **User** can write many **Reviews** (1 : N)
- One **User** can save many **Wishlist Items** (1 : N)
- One **Category** can be the parent of many child **Categories** (1 : N, self-referencing — e.g. Clothing → Shirts)
- One **Category** can contain many **Products** (1 : N)
- One **Product** can have many **Variants** — each Variant represents one color option (1 : N)
- One **Variant** can have many **SKUs** — each SKU is a specific size within that color, with its own price and stock (1 : N)
- One **Cart** can hold many **Cart_Items**, each pointing to a specific SKU so the exact color and size is captured (N : M resolved via Cart_Items)
- One **Order** can contain many **Order_Items**, each pointing to a specific SKU at a locked unit price (N : M resolved via Order_Items)
- One **Product** can receive many **Reviews**, and one **User** can write many **Reviews** (N : M resolved via Reviews)
- One **Product** can be saved by many users via **Wishlist_Items**, and one user can save many Products (N : M resolved via Wishlist_Items)

**Design Note on Cart_Items → SKUs**

Cart_Items links to SKUS rather than directly to PRODUCTS because a cart line must be able to say "Navy Blue, size M" — not just "this shirt." If Cart_Items pointed at PRODUCTS, checkout would have no way to know which size or color the customer chose. ORDER_ITEMS follows the same pattern, keeping cart and order lines consistent with each other. This decision is made before any cart code exists to avoid rewriting the migration, API, and tests later.
