const { newDb }  = require('pg-mem');
const request    = require('supertest');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const fs         = require('fs');
const path       = require('path');

let app, pool;

// ─── Setup: boot in-memory PostgreSQL, run migration, seed test data ──────────
beforeAll(async () => {
  process.env.JWT_SECRET = 'spclovers-test-secret';

  const db = newDb();
  
  // Mock jsonb_typeof function since pg-mem doesn't implement it natively
  db.public.registerFunction({
    name: 'jsonb_typeof',
    args: [db.public.getType('jsonb')],
    returns: db.public.getType('text'),
    implementation: () => 'object',
  });

  const pg = db.adapters.createPg();
  pool = new pg.Pool();

  // Run migration SQL against the in-memory DB
  let sql = fs.readFileSync(
    path.join(__dirname, '../migrations/001_sprint2_catalog.sql'),
    'utf8'
  );
  // pg-mem doesn't fully support DECIMAL precision args in its AST parser
  sql = sql.replace(/DECIMAL\(10,2\)/g, 'DECIMAL');
  await pool.query(sql);

  // Mock the db module so app.js uses the in-memory pool
  jest.resetModules();
  jest.doMock('../src/db', () => ({ pool }));
  app = require('../src/app');

  // Seed: admin + customer users
  const hash = await bcrypt.hash('Admin@12345', 10);
  await pool.query(
    `INSERT INTO users(full_name, email, password_hash, role)
     VALUES('Admin User', 'admin@spclovers.test', $1, 'admin'),
           ('Customer User', 'customer@spclovers.test', $1, 'customer')`,
    [hash]
  );

  // Seed: a root category so product tests have a valid category_id
  await pool.query(
    `INSERT INTO categories(name, slug) VALUES('Clothing', 'clothing')`
  );
});

afterAll(async () => pool && pool.end());

// Helper: generate a signed JWT
function makeToken(role = 'admin') {
  return jwt.sign(
    { id: 1, email: 'admin@spclovers.test', role },
    process.env.JWT_SECRET
  );
}

// ─── Test 1: Admin can create a category and a product ───────────────────────
test('admin can create a category and a product', async () => {
  // Create a child category under the seeded root
  const catRes = await request(app)
    .post('/api/v1/admin/categories')
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ name: 'Shirts', slug: 'shirts', parent_id: 1 });
  expect(catRes.statusCode).toBe(201);
  expect(catRes.body.name).toBe('Shirts');
  expect(catRes.body.is_active).toBe(true);

  // Create a product under that category
  const prodRes = await request(app)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({
      name: 'Oxford White Shirt',
      slug: 'oxford-white-shirt',
      description: 'A clean white cotton shirt.',
      status: 'draft',
      category_id: catRes.body.id,
      specifications: { fabric: 'cotton', fit: 'slim', care_instructions: 'machine wash cold' },
    });
  expect(prodRes.statusCode).toBe(201);
  expect(prodRes.body.slug).toBe('oxford-white-shirt');
});

// ─── Test 2: Duplicate product slug returns 400 ───────────────────────────────
test('duplicate product slug is rejected', async () => {
  const catId = (await pool.query("SELECT id FROM categories WHERE slug='clothing'")).rows[0].id;

  await request(app)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ name: 'Chino Pants', slug: 'chino-same-slug', category_id: catId });

  const dup = await request(app)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ name: 'Other Pants', slug: 'chino-same-slug', category_id: catId });

  expect(dup.statusCode).toBe(400);
  expect(dup.body.error).toMatch(/slug/i);
});

// ─── Test 3: Duplicate color variant is rejected ──────────────────────────────
test('duplicate color variant for a product is rejected', async () => {
  const catId = (await pool.query("SELECT id FROM categories WHERE slug='clothing'")).rows[0].id;
  const prod  = (await pool.query(
    "INSERT INTO products(name, slug, category_id) VALUES('Test Shirt', 'test-shirt-var', $1) RETURNING id",
    [catId]
  )).rows[0].id;

  const first = await request(app)
    .post(`/api/v1/admin/products/${prod}/variants`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ color: 'Navy Blue' });
  expect(first.statusCode).toBe(201);

  const dup = await request(app)
    .post(`/api/v1/admin/products/${prod}/variants`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ color: 'Navy Blue' });
  expect(dup.statusCode).toBe(400);
  expect(dup.body.error).toMatch(/color variant/i);
});

// ─── Test 4: SKU duplicate code and negative stock/price are rejected ─────────
test('duplicate SKU code and negative stock or price are rejected', async () => {
  const catId = (await pool.query("SELECT id FROM categories WHERE slug='clothing'")).rows[0].id;
  const prod  = (await pool.query(
    "INSERT INTO products(name, slug, category_id) VALUES('SKU Shirt', 'sku-shirt-test', $1) RETURNING id",
    [catId]
  )).rows[0].id;
  const varId = (await pool.query(
    "INSERT INTO variants(product_id, color) VALUES($1, 'White') RETURNING id",
    [prod]
  )).rows[0].id;

  // First SKU — should succeed
  const first = await request(app)
    .post(`/api/v1/admin/products/${prod}/skus`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ variant_id: varId, size: 'M', sku_code: 'SHT-TST-M', price: 1200, stock_quantity: 10 });
  expect(first.statusCode).toBe(201);
  expect(first.body.price).toMatch(/^1200(\.00)?$/);

  // Duplicate SKU code — should fail
  const dup = await request(app)
    .post(`/api/v1/admin/products/${prod}/skus`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ variant_id: varId, size: 'L', sku_code: 'SHT-TST-M', price: 1200, stock_quantity: 5 });
  expect(dup.statusCode).toBe(400);

  // Negative stock via PATCH — should fail
  const negStock = await request(app)
    .patch(`/api/v1/admin/skus/${first.body.id}`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ stock_quantity: -5 });
  expect(negStock.statusCode).toBe(400);

  // Negative price via PATCH — should fail
  const negPrice = await request(app)
    .patch(`/api/v1/admin/skus/${first.body.id}`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ price: -1 });
  expect(negPrice.statusCode).toBe(400);
});

// ─── Test 5: Category cycle prevention ───────────────────────────────────────
test('setting a category parent to its own descendant is rejected', async () => {
  const parent = (await pool.query(
    "INSERT INTO categories(name, slug) VALUES('Parent Cat', 'parent-cat') RETURNING id"
  )).rows[0].id;
  const child = (await pool.query(
    "INSERT INTO categories(name, slug, parent_id) VALUES('Child Cat', 'child-cat', $1) RETURNING id",
    [parent]
  )).rows[0].id;

  // Try to set parent's parent_id to child → cycle
  const res = await request(app)
    .patch(`/api/v1/admin/categories/${parent}`)
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({ parent_id: child });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/ancestor/i);
});

// ─── Test 6: Invalid specifications are rejected ──────────────────────────────
test('product with invalid specifications keys is rejected with 422', async () => {
  const catId = (await pool.query("SELECT id FROM categories WHERE slug='clothing'")).rows[0].id;
  const res = await request(app)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${makeToken()}`)
    .send({
      name: 'Bad Spec Shirt',
      slug: 'bad-spec-shirt',
      category_id: catId,
      specifications: { fabric: 'cotton', unknown_key: 'value' },
    });
  expect(res.statusCode).toBe(422);
});

// ─── Test 7: Unauthenticated and non-admin requests are blocked ───────────────
test('admin endpoints reject unauthenticated and non-admin users', async () => {
  // No token → 401
  const noToken = await request(app).get('/api/v1/admin/products');
  expect(noToken.statusCode).toBe(401);

  // Customer token → 403
  const customerToken = jwt.sign(
    { id: 2, email: 'customer@spclovers.test', role: 'customer' },
    process.env.JWT_SECRET
  );
  const forbidden = await request(app)
    .get('/api/v1/admin/products')
    .set('Authorization', `Bearer ${customerToken}`);
  expect(forbidden.statusCode).toBe(403);
});
