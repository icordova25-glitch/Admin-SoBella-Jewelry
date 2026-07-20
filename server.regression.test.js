const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sobella-regression-'));
process.env.DATA_DIR = path.join(tempRoot, 'data');
process.env.UPLOADS_DIR = path.join(tempRoot, 'uploads');
process.env.BACKOFFICE_USERNAME = 'admin';
process.env.BACKOFFICE_PASSWORD = 'sobella-admin';

const { app } = require('./server');
const server = app.listen(0);
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const authHeader = `Basic ${Buffer.from('admin:sobella-admin').toString('base64')}`;
const runtimeProductsPath = path.join(process.env.DATA_DIR, 'products.json');

test.after(() => {
  server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('create product in admin API is visible in shop products API', async () => {
  const payload = {
    sku: 'TEST-REG-001',
    category: 'rings',
    name: 'Regression Ring',
    description: 'Created by regression test',
    price: 222,
    stock: 3,
  };

  const createResponse = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.equal(created.success, true);
  assert.equal(created.product.sku, payload.sku);

  const shopProductsResponse = await fetch(`${baseUrl}/api/products`);
  assert.equal(shopProductsResponse.status, 200);
  const products = await shopProductsResponse.json();

  const found = products.find((product) => product.sku === payload.sku);
  assert.ok(found, 'New product should appear in /api/products for shop page');
  assert.equal(found.name, payload.name);
});

test('save bio in admin API is visible in shop bio API', async () => {
  const bioText = `Regression bio ${Date.now()}`;

  const saveResponse = await fetch(`${baseUrl}/api/business-bio`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bio: bioText }),
  });

  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.bio, bioText);

  const publicBioResponse = await fetch(`${baseUrl}/api/business-bio`);
  assert.equal(publicBioResponse.status, 200);
  const publicBio = await publicBioResponse.json();
  assert.equal(publicBio.bio, bioText);
});

test('uploaded product image is visible from shop API and image URL is served', async () => {
  const sku = `IMG-REG-${Date.now()}`;
  const payload = {
    sku,
    category: 'rings',
    name: 'Image Regression Product',
    description: 'Product with uploaded image',
    price: 99,
    stock: 1,
    imageFile: {
      filename: 'pixel.png',
      content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p7tYAAAAASUVORK5CYII=',
    },
  };

  const createResponse = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.equal(created.success, true);
  assert.ok(created.product.image.startsWith('/uploads/'));

  const shopProductsResponse = await fetch(`${baseUrl}/api/products`);
  assert.equal(shopProductsResponse.status, 200);
  const products = await shopProductsResponse.json();
  const found = products.find((product) => product.sku === sku);
  assert.ok(found, 'Uploaded-image product should appear in /api/products');
  assert.ok(found.image.startsWith('/uploads/'));

  const imageResponse = await fetch(`${baseUrl}${found.image}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('content-type'), 'image/png');
});

test('admin product create still works when products data is malformed', async () => {
  fs.writeFileSync(runtimeProductsPath, JSON.stringify({ bad: true }), 'utf8');

  const sku = `SAFE-REG-${Date.now()}`;
  const createResponse = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sku,
      category: 'rings',
      name: 'Recovery Product',
      description: 'Created after malformed data',
      price: 45,
      stock: 1,
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.equal(created.success, true);

  const shopProductsResponse = await fetch(`${baseUrl}/api/products`);
  assert.equal(shopProductsResponse.status, 200);
  const products = await shopProductsResponse.json();
  const found = products.find((product) => product.sku === sku);
  assert.ok(found, 'Product should still be added after malformed data recovery');
});
