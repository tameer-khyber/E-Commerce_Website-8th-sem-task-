# Sprint 1: System Architecture & Scope Definition
### Project: S&P Clovers — Online Store for Shirts & Pants

---

## Section 1: Target Audience & Market Focus

**Primary Persona**
Young adults and students (roughly ages 16–30) who shop casually online, are comfortable using a phone or laptop to buy clothes, and care about price, style, and a smooth checkout experience.

**Core Pain Point**
Many small clothing sellers only sell through Instagram/WhatsApp, which makes browsing, checkout, and order tracking messy. S&P Clovers solves this by giving customers one clean website where they can browse shirts and pants by size/color, add to cart, and check out properly — without needing to message anyone manually.

**Domain Scope**
Apparel / Fashion — specifically casual men's and women's shirts and pants.

---

## Section 2: Minimum Viable Product (MVP) Feature Scope

| Category | Feature Name | Description | Priority |
|---|---|---|---|
| Authentication | Sign Up & Login | Create account and log in securely (password hashing + JWT session). | High (MVP) |
| Catalog | Product Browsing & Search | Browse shirts/pants with filters for size, color, and price; search bar. | High (MVP) |
| Cart | Cart Management | Add, remove, and update items and quantities; cart is saved between visits. | High (MVP) |
| Checkout | Order Processing | Enter shipping address, pay (Stripe or mock payment), confirm order. | High (MVP) |
| Admin | Inventory Control | Admin panel to add/edit/delete products and update stock levels. | Medium |
| Reviews | Ratings & Comments | Users who bought a product can leave a star rating and a written comment. | High (MVP) |

---

## Section 3: Tech Stack Selection & Justification

**Frontend: HTML, CSS & JavaScript**
Chosen because it gives full control over the design and requires zero build-tool setup, keeping things simple for an academic-timeline build. Parts of it can later be upgraded to a framework such as React if the project grows, but that isn't required for the MVP.

**Backend: Node.js with Express**
Node.js uses JavaScript on the server too, so the same language runs across frontend and backend. Express is lightweight, has strong community support, and has ready-made packages for authentication (JWT), payments (Stripe), and file uploads.

**Database: PostgreSQL**
A relational database fits this domain because users, products, and orders relate to each other in fixed, predictable ways (a user has many orders, an order has many items). PostgreSQL enforces data integrity strictly, handles prices accurately, and is free and widely supported. MySQL is a viable alternative if hosting is easier to find.

**Caching & Asynchronous Processing (Optional): Redis**
Not required for the MVP, but useful later for faster cart-session storage and for sending order-confirmation emails in the background without slowing down checkout.

---

## Section 4: Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    USERS ||--o{ ORDERS : places
    USERS ||--|| CART : owns
    USERS ||--o{ REVIEWS : writes
    CART ||--o{ CART_ITEMS : holds
    PRODUCTS ||--o{ CART_ITEMS : added_as
    PRODUCTS ||--o{ ORDER_ITEMS : ordered_in
    PRODUCTS ||--o{ REVIEWS : receives
    CATEGORIES ||--o{ PRODUCTS : groups
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
        string name
    }

    PRODUCTS {
        int id PK
        int category_id FK
        string name
        string description
        decimal price
        string size
        string color
        int stock_quantity
        string image_url
    }

    REVIEWS {
        int id PK
        int product_id FK
        int user_id FK
        int rating
        string comment
        timestamp created_at
    }

    CART {
        int id PK
        int user_id FK UK
    }

    CART_ITEMS {
        int id PK
        int cart_id FK
        int product_id FK
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
        int product_id FK
        int quantity
        decimal unit_price
    }
```

**Relationships in Plain Words**
- One **User** can place many **Orders** (1 : N)
- One **User** has exactly one **Cart** (1 : 1)
- One **Category** (e.g. Shirts) can have many **Products** (1 : N)
- One **Order** can contain many **Order_Items**, and each item points to one **Product** — this is how one order can have multiple products (N : M, managed through Order_Items)
- One **Cart** can hold many **Cart_Items**, same pattern as orders
- One **Product** can receive many **Reviews**, and one **User** can write many **Reviews** (each review links one user to one product)
