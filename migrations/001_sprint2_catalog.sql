-- =============================================================
-- S&P Clovers — Sprint 2 Catalog Migration
-- Project: Online Store for Shirts & Pants
-- Run via: npm run migrate
-- =============================================================

-- Users: customers and admin accounts
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(20)  NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Categories: two-level tree (e.g. Clothing > Shirts, Pants)
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
  name       VARCHAR(100)  NOT NULL,
  slug       VARCHAR(120)  NOT NULL UNIQUE,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Products: identity and description; color + size detail lives in variants/skus
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name          VARCHAR(150) NOT NULL,
  slug          VARCHAR(170) NOT NULL UNIQUE,
  description   TEXT         NOT NULL DEFAULT '',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'archived')),
  specifications JSONB       NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(specifications) = 'object'),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Variants: one row per color option for a product
-- e.g. "Slim Fit Oxford Shirt" -> "White", "Navy Blue"
CREATE TABLE IF NOT EXISTS variants (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  color      VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, color)
);

-- SKUs: the actual sellable unit — a specific size within a color variant
-- e.g. "White / M" -> sku_code "SHT-WHT-M", price 1299, stock 25
CREATE TABLE IF NOT EXISTS skus (
  id             SERIAL PRIMARY KEY,
  variant_id     INTEGER        NOT NULL REFERENCES variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  size           VARCHAR(10)    NOT NULL,   -- XS, S, M, L, XL, XXL / 28, 30, 32, 34, 36
  sku_code       VARCHAR(50)    NOT NULL UNIQUE,
  price          DECIMAL(10,2)  NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER        NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, size)
);

-- Assets: image/media metadata only — no upload pipeline this sprint
CREATE TABLE IF NOT EXISTS assets (
  id                  SERIAL PRIMARY KEY,
  product_id          INTEGER REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  variant_id          INTEGER REFERENCES variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  storage_key_or_url  VARCHAR(500) NOT NULL,
  role                VARCHAR(20)  NOT NULL DEFAULT 'gallery'
                      CHECK (role IN ('main', 'gallery', 'thumbnail')),
  alt_text            VARCHAR(200) NOT NULL DEFAULT '',
  sort_order          INTEGER      NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)
);

-- Reviews: schema created this sprint; customer write endpoint deferred to Sprint 3
CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER      NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  rating     INTEGER      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Wishlist items: user saves a product for later
-- UNIQUE constraint prevents duplicate wishlist entries for the same product
CREATE TABLE IF NOT EXISTS wishlist_items (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  product_id INTEGER     NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- Carts: one cart per user (1:1 relationship)
CREATE TABLE IF NOT EXISTS carts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cart items: each line references a SKU to capture exact color + size chosen
CREATE TABLE IF NOT EXISTS cart_items (
  id       SERIAL PRIMARY KEY,
  cart_id  INTEGER     NOT NULL REFERENCES carts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sku_id   INTEGER     NOT NULL REFERENCES skus(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity INTEGER     NOT NULL CHECK (quantity > 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders: created on checkout confirmation
CREATE TABLE IF NOT EXISTS orders (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  total_amount     DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  shipping_address VARCHAR(300)  NOT NULL DEFAULT '',
  tracking_number  VARCHAR(60),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Order items: each line references a SKU at the price locked at time of purchase
CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sku_id     INTEGER       NOT NULL REFERENCES skus(id)   ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity   INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0)
);
