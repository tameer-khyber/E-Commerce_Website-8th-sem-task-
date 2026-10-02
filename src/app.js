const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { pool }         = require('./db');
const { requireAdmin } = require('./auth');

const app = express();
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Send a 400 validation error */
function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

/** True only for a non-negative finite number (used for prices) */
function isNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** True only for a non-negative integer (used for stock) */
function isNonNegativeInt(v) {
  return Number.isInteger(v) && v >= 0;
}

/** Validate the specifications JSONB: only fabric, fit, care_instructions (strings) */
const ALLOWED_SPEC_KEYS = new Set(['fabric', 'fit', 'care_instructions']);
function validateSpecifications(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return false;
  for (const [key, val] of Object.entries(specs)) {
    if (!ALLOWED_SPEC_KEYS.has(key)) return false;
    if (typeof val !== 'string') return false;
  }
  return true;
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', project: 'S&P Clovers' }));

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Returns: { token }
 */
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return badRequest(res, 'email and password are required');

    const result = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '2h' }
    );
    res.json({ token });
  } catch (err) { next(err); }
});

// ─── Admin — Categories ───────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/categories
 * Body: { name, slug, parent_id? }
 */
app.post('/api/v1/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, parent_id } = req.body || {};
    if (!name || !slug) return badRequest(res, 'name and slug are required');

    if (parent_id !== undefined && parent_id !== null) {
      if (!Number.isInteger(parent_id)) return badRequest(res, 'parent_id must be an integer');
      const parent = await pool.query('SELECT id FROM categories WHERE id = $1', [parent_id]);
      if (!parent.rowCount) return badRequest(res, 'parent category not found');
    }

    const pid = parent_id ?? null;
    const r = await pool.query(
      'INSERT INTO categories(name, slug, parent_id) VALUES($1, $2, $3) RETURNING *',
      [name, slug, pid]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'category slug already exists');
    next(err);
  }
});

/**
 * GET /api/v1/admin/categories
 * Returns all categories ordered by id
 */
app.get('/api/v1/admin/categories', requireAdmin, async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json(r.rows);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/v1/admin/categories/:id
 * Body: { name?, slug?, parent_id?, is_active? }
 * Includes cycle prevention: a category cannot become its own ancestor
 */
app.patch('/api/v1/admin/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, 'invalid category id');

    const current = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (!current.rowCount) return res.status(404).json({ error: 'category not found' });

    const { name, slug, parent_id, is_active } = req.body || {};

    // Cycle prevention: walk up the proposed parent chain
    if (parent_id !== undefined && parent_id !== null) {
      if (parent_id === id) return badRequest(res, 'a category cannot be its own parent');
      if (!Number.isInteger(parent_id)) return badRequest(res, 'parent_id must be an integer');

      const proposed = await pool.query('SELECT id FROM categories WHERE id = $1', [parent_id]);
      if (!proposed.rowCount) return badRequest(res, 'parent category not found');

      let cursor = parent_id;
      const visited = new Set();
      while (cursor) {
        if (cursor === id) return badRequest(res, 'category cannot become its own ancestor');
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const row = await pool.query('SELECT parent_id FROM categories WHERE id = $1', [cursor]);
        cursor = row.rows[0]?.parent_id ?? null;
      }
    }

    const row = current.rows[0];
    const r = await pool.query(
      `UPDATE categories
         SET name = $1, slug = $2, parent_id = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        name      ?? row.name,
        slug      ?? row.slug,
        parent_id === undefined ? row.parent_id : parent_id,
        is_active === undefined ? row.is_active : is_active,
        id,
      ]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'category slug already exists');
    next(err);
  }
});

/**
 * DELETE /api/v1/admin/categories/:id
 * Soft-deactivates the category (is_active = false)
 */
app.delete('/api/v1/admin/categories/:id', requireAdmin, async (req, res, next) => {
  try {
    const r = await pool.query(
      'UPDATE categories SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [Number(req.params.id)]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'category not found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── Admin — Products ─────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/products
 * Body: { name, slug, description?, status?, category_id, specifications? }
 */
app.post('/api/v1/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const {
      name,
      slug,
      description  = '',
      status       = 'draft',
      category_id,
      specifications = {},
    } = req.body || {};

    if (!name || !slug || !Number.isInteger(category_id)) {
      return badRequest(res, 'name, slug, and category_id (integer) are required');
    }
    if (!['draft', 'published', 'archived'].includes(status)) {
      return badRequest(res, 'status must be draft, published, or archived');
    }
    if (!validateSpecifications(specifications)) {
      return res.status(422).json({
        error: 'specifications must be an object with only fabric, fit, and care_instructions string keys',
      });
    }

    const cat = await pool.query('SELECT id, is_active FROM categories WHERE id = $1', [category_id]);
    if (!cat.rowCount || !cat.rows[0].is_active) {
      return badRequest(res, 'an active category is required');
    }

    const r = await pool.query(
      `INSERT INTO products(name, slug, description, status, category_id, specifications)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, category_id, status, created_at`,
      [name, slug, description, status, category_id, JSON.stringify(specifications)]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'product slug already exists');
    next(err);
  }
});

/**
 * GET /api/v1/admin/products
 * Returns products joined with their category name
 */
app.get('/api/v1/admin/products', requireAdmin, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.name, p.slug, p.status, p.created_at, c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
        ORDER BY p.id`
    );
    res.json(r.rows);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/v1/admin/products/:id
 * Body: { name?, slug?, description?, status?, category_id?, specifications? }
 */
app.patch('/api/v1/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const old = (await pool.query('SELECT * FROM products WHERE id = $1', [id])).rows[0];
    if (!old) return res.status(404).json({ error: 'product not found' });

    const b = req.body || {};

    if (b.status && !['draft', 'published', 'archived'].includes(b.status)) {
      return badRequest(res, 'status must be draft, published, or archived');
    }
    if (b.specifications !== undefined && !validateSpecifications(b.specifications)) {
      return res.status(422).json({
        error: 'specifications must be an object with only fabric, fit, and care_instructions string keys',
      });
    }
    if (b.category_id !== undefined) {
      const cat = await pool.query('SELECT is_active FROM categories WHERE id = $1', [b.category_id]);
      if (!cat.rowCount || !cat.rows[0].is_active) return badRequest(res, 'an active category is required');
    }

    const r = await pool.query(
      `UPDATE products
         SET name = $1, slug = $2, description = $3, status = $4,
             category_id = $5, specifications = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        b.name           ?? old.name,
        b.slug           ?? old.slug,
        b.description    ?? old.description,
        b.status         ?? old.status,
        b.category_id    ?? old.category_id,
        b.specifications !== undefined ? JSON.stringify(b.specifications) : old.specifications,
        id,
      ]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'product slug already exists');
    next(err);
  }
});

/**
 * DELETE /api/v1/admin/products/:id
 * Archives the product (status = 'archived')
 */
app.delete('/api/v1/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    const r = await pool.query(
      "UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *",
      [Number(req.params.id)]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'product not found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── Admin — Variants (Color) ─────────────────────────────────────────────────

/**
 * POST /api/v1/admin/products/:id/variants
 * Body: { color }
 * Adds a color variant to a product
 */
app.post('/api/v1/admin/products/:id/variants', requireAdmin, async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { color } = req.body || {};

    if (!color || typeof color !== 'string' || !color.trim()) {
      return badRequest(res, 'color is required and must be a non-empty string');
    }

    const product = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (!product.rowCount) return res.status(404).json({ error: 'product not found' });

    const r = await pool.query(
      'INSERT INTO variants(product_id, color) VALUES($1, $2) RETURNING *',
      [productId, color.trim()]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'color variant already exists for this product');
    next(err);
  }
});

// ─── Admin — SKUs (Size within Color) ────────────────────────────────────────

/**
 * POST /api/v1/admin/products/:id/skus
 * Body: { variant_id, size, sku_code, price, stock_quantity?, is_active? }
 * Adds a size SKU to a variant that belongs to the given product
 */
app.post('/api/v1/admin/products/:id/skus', requireAdmin, async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { variant_id, size, sku_code, price, stock_quantity = 0, is_active = true } = req.body || {};

    if (!Number.isInteger(variant_id))         return badRequest(res, 'variant_id must be an integer');
    if (!size || typeof size !== 'string')      return badRequest(res, 'size is required');
    if (!sku_code || typeof sku_code !== 'string') return badRequest(res, 'sku_code is required');
    if (!isNonNegativeNumber(price))            return badRequest(res, 'price must be a non-negative number');
    if (!isNonNegativeInt(stock_quantity))      return badRequest(res, 'stock_quantity must be a non-negative integer');

    // Ensure the variant actually belongs to the product in the URL
    const variant = await pool.query(
      'SELECT id, product_id FROM variants WHERE id = $1',
      [variant_id]
    );
    if (!variant.rowCount || variant.rows[0].product_id !== productId) {
      return badRequest(res, 'variant does not belong to this product');
    }

    const r = await pool.query(
      `INSERT INTO skus(variant_id, size, sku_code, price, stock_quantity, is_active)
       VALUES($1, $2, $3, $4, $5, $6)
       RETURNING id, variant_id, size, sku_code, price::text AS price, stock_quantity, is_active, created_at`,
      [variant_id, size.trim(), sku_code.trim(), price, stock_quantity, is_active]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return badRequest(res, 'SKU code already exists');
    if (err.code === '23514') return badRequest(res, 'stock cannot be negative and price must be non-negative');
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/skus/:id
 * Body: { price?, stock_quantity?, is_active? }
 */
app.patch('/api/v1/admin/skus/:id', requireAdmin, async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const old = (await pool.query('SELECT * FROM skus WHERE id = $1', [id])).rows[0];
    if (!old) return res.status(404).json({ error: 'SKU not found' });

    const b = req.body || {};
    if (b.price          !== undefined && !isNonNegativeNumber(b.price))    return badRequest(res, 'price must be non-negative');
    if (b.stock_quantity !== undefined && !isNonNegativeInt(b.stock_quantity)) return badRequest(res, 'stock_quantity cannot be negative');

    const r = await pool.query(
      `UPDATE skus
         SET price = $1, stock_quantity = $2, is_active = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, variant_id, size, sku_code, price::text AS price, stock_quantity, is_active, updated_at`,
      [
        b.price          ?? old.price,
        b.stock_quantity ?? old.stock_quantity,
        b.is_active      ?? old.is_active,
        id,
      ]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/v1/admin/skus/:id
 * Soft-deactivates the SKU (is_active = false)
 */
app.delete('/api/v1/admin/skus/:id', requireAdmin, async (req, res, next) => {
  try {
    const r = await pool.query(
      'UPDATE skus SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [Number(req.params.id)]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'SKU not found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[S&P Clovers API Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
