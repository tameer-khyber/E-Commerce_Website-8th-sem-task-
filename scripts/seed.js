require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Upsert a category; returns its id */
async function upsertCategory(client, name, slug, parentId = null) {
  const r = await client.query(
    `INSERT INTO categories(name, slug, parent_id)
     VALUES($1, $2, $3)
     ON CONFLICT(slug)
       DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id
     RETURNING id`,
    [name, slug, parentId]
  );
  return r.rows[0].id;
}

/** Upsert a product; returns its id */
async function upsertProduct(client, name, slug, description, status, categoryId, specs) {
  const r = await client.query(
    `INSERT INTO products(name, slug, description, status, category_id, specifications)
     VALUES($1, $2, $3, $4, $5, $6)
     ON CONFLICT(slug)
       DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description,
         status = EXCLUDED.status, category_id = EXCLUDED.category_id,
         specifications = EXCLUDED.specifications
     RETURNING id`,
    [name, slug, description, status, categoryId, JSON.stringify(specs)]
  );
  return r.rows[0].id;
}

/** Upsert a color variant; returns its id */
async function upsertVariant(client, productId, color) {
  const r = await client.query(
    `INSERT INTO variants(product_id, color)
     VALUES($1, $2)
     ON CONFLICT(product_id, color)
       DO UPDATE SET color = EXCLUDED.color
     RETURNING id`,
    [productId, color]
  );
  return r.rows[0].id;
}

/** Upsert a size SKU */
async function upsertSku(client, variantId, size, skuCode, price, stock) {
  await client.query(
    `INSERT INTO skus(variant_id, size, sku_code, price, stock_quantity, is_active)
     VALUES($1, $2, $3, $4, $5, true)
     ON CONFLICT(sku_code)
       DO UPDATE SET
         variant_id = EXCLUDED.variant_id, size = EXCLUDED.size,
         price = EXCLUDED.price, stock_quantity = EXCLUDED.stock_quantity,
         is_active = true`,
    [variantId, size, skuCode, price, stock]
  );
}

// ─── Main Seed ────────────────────────────────────────────────────────────────

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Admin user
    const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@spclovers.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const hash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO users(full_name, email, password_hash, role)
       VALUES('S&P Clovers Admin', $1, $2, 'admin')
       ON CONFLICT(email)
         DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
      [adminEmail, hash]
    );

    // 2. Category tree: Clothing > Shirts, Pants
    const catClothing = await upsertCategory(client, 'Clothing', 'clothing');
    const catShirts   = await upsertCategory(client, 'Shirts',   'shirts',   catClothing);
    const catPants    = await upsertCategory(client, 'Pants',    'pants',    catClothing);

    // 3. Products
    const prodOxford = await upsertProduct(
      client,
      'Slim Fit Oxford Shirt',
      'slim-fit-oxford-shirt',
      'A breathable 100% cotton slim-fit shirt, perfect for casual and semi-formal occasions.',
      'published',
      catShirts,
      { fabric: 'cotton', fit: 'slim', care_instructions: 'machine wash cold' }
    );

    const prodChino = await upsertProduct(
      client,
      'Classic Chino Pants',
      'classic-chino-pants',
      'Versatile chino trousers with a straight-leg cut, ideal for everyday smart-casual wear.',
      'published',
      catPants,
      { fabric: 'cotton-polyester blend', fit: 'regular', care_instructions: 'machine wash warm' }
    );

    const prodDenim = await upsertProduct(
      client,
      'Relaxed Denim Pants',
      'relaxed-denim-pants',
      'Easy-wearing denim jeans with a relaxed fit and soft stretch fabric.',
      'draft',
      catPants,
      { fabric: 'denim stretch', fit: 'relaxed', care_instructions: 'machine wash cold, inside out' }
    );

    // 4. Variants (colors) and SKUs (sizes)
    //    Slim Fit Oxford Shirt — two color variants
    const varOxfordWhite = await upsertVariant(client, prodOxford, 'White');
    const varOxfordNavy  = await upsertVariant(client, prodOxford, 'Navy Blue');

    //    Classic Chino Pants — one color variant
    const varChinoKhaki  = await upsertVariant(client, prodChino, 'Khaki');

    //    Relaxed Denim Pants — one color variant
    const varDenimIndigo = await upsertVariant(client, prodDenim, 'Indigo');

    // 5. SKUs — 4 valid ones
    await upsertSku(client, varOxfordWhite, 'M',  'SHT-WHT-M',  1299, 25);
    await upsertSku(client, varOxfordWhite, 'L',  'SHT-WHT-L',  1299, 18);
    await upsertSku(client, varOxfordNavy,  'M',  'SHT-NVY-M',  1349, 30);
    await upsertSku(client, varChinoKhaki,  '32', 'PNT-KHK-32', 1899, 15);

    // NOTE: Slim Fit Oxford Shirt / Navy Blue / XXL is deliberately NOT created.
    // An unavailable combination is represented by its absence, not a fake zero-stock SKU. (CAT-04)

    await client.query('COMMIT');

    console.log('Seed completed successfully:');
    console.log('  → Admin user:  admin@spclovers.local');
    console.log('  → Categories:  Clothing → Shirts, Pants');
    console.log('  → Products:    Slim Fit Oxford Shirt, Classic Chino Pants, Relaxed Denim Pants');
    console.log('  → SKUs:        SHT-WHT-M, SHT-WHT-L, SHT-NVY-M, PNT-KHK-32');
    console.log('  → Intentionally MISSING: Slim Fit Oxford Shirt / Navy Blue / XXL (CAT-04 demo)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
