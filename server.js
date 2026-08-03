const express = require('express');
const path = require('path');
const fs = require('fs');
let kv = null;

try {
  // Optional dependency in local dev; enabled automatically in Vercel when env vars exist.
  // eslint-disable-next-line global-require
  kv = require('@vercel/kv').kv;
} catch (error) {
  kv = null;
}

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const productsPath = path.join(dataDir, 'products.json');
const ordersPath = path.join(dataDir, 'orders.json');
const backofficeDir = path.join(__dirname, 'backoffice');
const businessBioPath = path.join(dataDir, 'business-bio.json');
const bankInfoPath = path.join(dataDir, 'bank-info.json');
const siteAccessPath = path.join(dataDir, 'site-access.json');

const STORAGE_KEYS = {
  products: 'sobella:products',
  orders: 'sobella:orders',
  businessBio: 'sobella:businessBio',
  bankInfo: 'sobella:bankInfo',
  siteAccess: 'sobella:siteAccess',
};

const defaultProducts = [
  {
    sku: 'EARR-001',
    category: 'earings',
    name: 'Pearl Drop Earrings',
    description: 'Elegant pearl earrings for special occasions.',
    price: 89,
    stock: 12,
  },
  {
    sku: 'NECK-001',
    category: 'necklaces',
    name: 'Gold Chain Necklace',
    description: 'Layered gold necklace with a modern finish.',
    price: 120,
    stock: 8,
  },
  {
    sku: 'RING-001',
    category: 'rings',
    name: 'Diamond Accent Ring',
    description: 'A refined ring with a subtle sparkle.',
    price: 150,
    stock: 5,
  },
  {
    sku: 'BRACE-001',
    category: 'bracelets',
    name: 'Silver Cuff Bracelet',
    description: 'A polished bracelet with a timeless finish.',
    price: 95,
    stock: 7,
  },
];

const defaultOrders = [];
const defaultBusinessBio = {
  bio: 'SoBella Jewelry creates timeless, elegant pieces that celebrate modern love, personal style, and everyday luxury.',
};
const defaultBankInfo = {
  accountHolder: '',
  bankName: '',
  accountNumber: '',
  routingNumber: '',
};
const defaultSiteAccess = {
  enabled: true,
  reason: '',
  updatedAt: null,
};

app.set('trust proxy', true);
app.use(express.json());

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function hasKvConfigured() {
  return Boolean(kv && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readStore(key, filePath, fallback) {
  if (hasKvConfigured()) {
    const value = await kv.get(key);
    if (value !== null && value !== undefined) {
      return value;
    }
    await kv.set(key, fallback);
    return fallback;
  }

  return readJson(filePath, fallback);
}

async function writeStore(key, filePath, data) {
  if (hasKvConfigured()) {
    await kv.set(key, data);
    return;
  }

  writeJson(filePath, data);
}

function normalizeSiteAccess(state) {
  return {
    enabled: state?.enabled !== false,
    reason: String(state?.reason || ''),
    updatedAt: state?.updatedAt || null,
  };
}

async function readSiteAccess() {
  const state = await readStore(STORAGE_KEYS.siteAccess, siteAccessPath, defaultSiteAccess);
  return normalizeSiteAccess(state);
}

async function writeSiteAccess({ enabled, reason = '' }) {
  const nextState = normalizeSiteAccess({
    enabled,
    reason,
    updatedAt: new Date().toISOString(),
  });
  await writeStore(STORAGE_KEYS.siteAccess, siteAccessPath, nextState);
  return nextState;
}

function getBaseUrl(req) {
  const fromEnv = String(process.env.SITE_URL || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  return `${protocol}://${host}`.replace(/\/$/, '');
}

function buildSitemapXml(baseUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${baseUrl}/</loc>\n  </url>\n</urlset>`;
}

function buildProductSchema(products, baseUrl) {
  return products.map((product) => {
    const image = String(product.image || '');
    const imageUrl = image ? (image.startsWith('http') ? image : `${baseUrl}${image}`) : undefined;
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: String(product.name || ''),
      description: String(product.description || ''),
      sku: String(product.sku || ''),
      category: String(product.category || ''),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: String(Number(product.price || 0)),
        availability: Number(product.stock || 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: `${baseUrl}/`,
      },
      ...(imageUrl ? { image: imageUrl } : {}),
    };
  });
}

function renderSiteDisabledPage(reason) {
  const message = reason || 'Service is temporarily unavailable due to billing status.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Service Unavailable</title><style>body{font-family:Arial,sans-serif;background:#fff8f4;color:#2f2235;margin:0;display:grid;place-items:center;min-height:100vh;padding:1rem}main{max-width:560px;background:#fff;border:1px solid #f0e0d8;border-radius:16px;padding:1.4rem 1.2rem;box-shadow:0 10px 30px rgba(0,0,0,.05)}h1{margin:.2rem 0 0.6rem;font-size:1.4rem}p{margin:.4rem 0;line-height:1.5;color:#5e4b5f}</style></head><body><main><h1>Temporarily unavailable</h1><p>${message}</p><p>Please contact the site owner to restore access.</p></main></body></html>`;
}

function getOwnerKey(req) {
  return String(req.headers['x-site-access-key'] || req.query?.key || req.body?.key || '').trim();
}

function isOwnerAuthorized(req) {
  const secret = String(process.env.SITE_ACCESS_TOGGLE_KEY || process.env.OWNER_ACCESS_KEY || '').trim();
  if (!secret) {
    return false;
  }
  return getOwnerKey(req) === secret;
}

app.use(async (req, res, next) => {
  const alwaysAllowed = new Set(['/api/site-access', '/api/health/storage', '/robots.txt', '/sitemap.xml']);
  if (alwaysAllowed.has(req.path) || req.path.startsWith('/api/owner/site-access')) {
    return next();
  }

  const access = await readSiteAccess();
  if (access.enabled) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(402).json({
      error: 'Site access is currently disabled.',
      reason: access.reason,
      code: 'SITE_DISABLED',
    });
  }

  return res.status(402).type('html').send(renderSiteDisabledPage(access.reason));
});

app.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /backoffice\nSitemap: ${baseUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('application/xml').send(buildSitemapXml(baseUrl));
});

app.get('/api/schema/products', async (req, res) => {
  const products = await readStore(STORAGE_KEYS.products, productsPath, defaultProducts);
  res.json(buildProductSchema(products, getBaseUrl(req)));
});

app.get('/api/site-access', async (req, res) => {
  const access = await readSiteAccess();
  res.json(access);
});

app.post('/api/owner/site-access', async (req, res) => {
  if (!isOwnerAuthorized(req)) {
    return res.status(401).json({ error: 'Owner authorization required.' });
  }

  const enabled = req.body?.enabled;
  const reason = String(req.body?.reason || '').trim();
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be true or false.' });
  }

  const updated = await writeSiteAccess({ enabled, reason });
  return res.json({ success: true, siteAccess: updated });
});

app.get('/api/owner/site-access/:action', async (req, res) => {
  const action = String(req.params.action || '').toLowerCase();

  if (action === 'status') {
    const access = await readSiteAccess();
    return res.json({ success: true, siteAccess: access });
  }

  if (!isOwnerAuthorized(req)) {
    return res.status(401).json({ error: 'Owner authorization required.' });
  }

  if (action !== 'enable' && action !== 'disable') {
    return res.status(400).json({
      error: 'Invalid action. Use enable, disable, or status.',
    });
  }

  const enabled = action === 'enable';
  const reason = enabled ? '' : String(req.query.reason || 'Subscription inactive').trim();
  const updated = await writeSiteAccess({ enabled, reason });
  return res.json({ success: true, siteAccess: updated });
});

app.use('/backoffice', (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});
app.use('/backoffice', express.static(backofficeDir));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/products', async (req, res) => {
  const products = await readStore(STORAGE_KEYS.products, productsPath, defaultProducts);
  res.json(products);
});

app.get('/api/health/storage', (req, res) => {
  const usingKv = hasKvConfigured();
  res.json({
    ok: true,
    storage: usingKv ? 'kv' : 'file',
    runtime: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/orders', async (req, res) => {
  const { customerName, email, items, paymentMethod } = req.body;

  if (!customerName || !email || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please complete the checkout form.' });
  }

  const products = await readStore(STORAGE_KEYS.products, productsPath, defaultProducts);
  const inventoryBySku = new Map(products.map((product) => [product.sku, product]));
  const orderedItems = [];

  for (const item of items) {
    const product = inventoryBySku.get(item.sku);

    if (!product) {
      return res.status(400).json({ error: `Product ${item.sku} was not found.` });
    }

    if (product.stock < item.quantity) {
      return res.status(400).json({ error: `Not enough stock for ${product.name}.` });
    }

    product.stock -= item.quantity;
    orderedItems.push({
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      price: product.price,
      lineTotal: product.price * item.quantity,
    });
  }

  const subtotal = orderedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = subtotal > 0 ? 12 : 0;
  const total = subtotal + shipping;

  const orders = await readStore(STORAGE_KEYS.orders, ordersPath, defaultOrders);
  const newOrder = {
    id: `ORD-${Date.now()}`,
    customerName,
    email,
    items: orderedItems,
    paymentMethod: paymentMethod || 'card',
    status: 'paid',
    total,
    createdAt: new Date().toISOString(),
  };

  orders.unshift(newOrder);
  await writeStore(STORAGE_KEYS.products, productsPath, products);
  await writeStore(STORAGE_KEYS.orders, ordersPath, orders);

  res.json({ success: true, order: newOrder });
});

app.get('/api/orders', async (req, res) => {
  const orders = await readStore(STORAGE_KEYS.orders, ordersPath, defaultOrders);
  res.json(orders);
});

app.get('/api/business-bio', async (req, res) => {
  const bio = await readStore(STORAGE_KEYS.businessBio, businessBioPath, defaultBusinessBio);
  res.json(bio);
});

app.post('/api/business-bio', async (req, res) => {
  const payload = {
    bio: String(req.body?.bio || '').slice(0, 500),
  };
  await writeStore(STORAGE_KEYS.businessBio, businessBioPath, payload);
  res.json(payload);
});

app.get('/api/business-bank-info', async (req, res) => {
  const bankInfo = await readStore(STORAGE_KEYS.bankInfo, bankInfoPath, defaultBankInfo);
  res.json(bankInfo);
});

app.post('/api/business-bank-info', async (req, res) => {
  const payload = {
    accountHolder: String(req.body?.accountHolder || '').trim(),
    bankName: String(req.body?.bankName || '').trim(),
    accountNumber: String(req.body?.accountNumber || '').trim(),
    routingNumber: String(req.body?.routingNumber || '').trim(),
  };
  await writeStore(STORAGE_KEYS.bankInfo, bankInfoPath, payload);
  res.json(payload);
});

app.post('/api/admin/products', async (req, res) => {
  const products = await readStore(STORAGE_KEYS.products, productsPath, defaultProducts);
  const payload = req.body || {};

  if (!payload.sku || !payload.name || !payload.category) {
    return res.status(400).json({ error: 'SKU, name, and category are required.' });
  }

  const existing = products.find((item) => item.sku === payload.sku);
  if (existing) {
    return res.status(400).json({ error: `Product ${payload.sku} already exists.` });
  }

  const product = {
    sku: String(payload.sku).trim(),
    category: String(payload.category).trim(),
    name: String(payload.name).trim(),
    description: String(payload.description || '').trim(),
    price: Number(payload.price || 0),
    stock: Number(payload.stock || 0),
    image: String(payload.image || ''),
  };

  products.push(product);
  await writeStore(STORAGE_KEYS.products, productsPath, products);
  res.json({ success: true, product });
});

app.put('/api/admin/products/:sku', async (req, res) => {
  const { sku } = req.params;
  const updates = req.body || {};
  const products = await readStore(STORAGE_KEYS.products, productsPath, defaultProducts);
  const index = products.findIndex((item) => item.sku === sku);

  if (index === -1) {
    return res.status(404).json({ error: `Product ${sku} was not found.` });
  }

  const product = products[index];
  const operation = updates.operation;

  if (operation === 'restock') {
    product.stock = Number(product.stock || 0) + 1;
  } else if (operation === 'decrease') {
    product.stock = Math.max(0, Number(product.stock || 0) - 1);
  } else if (operation === 'delete') {
    products.splice(index, 1);
    await writeStore(STORAGE_KEYS.products, productsPath, products);
    return res.json({ deleted: true, sku });
  } else {
    if (updates.name !== undefined) {
      product.name = String(updates.name).trim();
    }
    if (updates.category !== undefined) {
      product.category = String(updates.category).trim();
    }
    if (updates.description !== undefined) {
      product.description = String(updates.description);
    }
    if (updates.price !== undefined) {
      product.price = Number(updates.price);
    }
    if (updates.stock !== undefined) {
      product.stock = Math.max(0, Number(updates.stock));
    }
    if (updates.image !== undefined) {
      product.image = String(updates.image || '');
    }
  }

  products[index] = product;
  await writeStore(STORAGE_KEYS.products, productsPath, products);
  res.json({ success: true, product });
});

app.get('/backoffice', (req, res) => {
  res.sendFile(path.join(backofficeDir, 'admin.html'));
});

app.get('/backoffice/admin', (req, res) => {
  res.redirect(302, '/backoffice/admin.html');
});

app.get('/backoffice/orders', (req, res) => {
  res.redirect(302, '/backoffice/orders.html');
});

app.get('/admin', (req, res) => {
  res.redirect(302, '/backoffice/admin.html');
});

app.get('/admin.html', (req, res) => {
  res.redirect(302, '/backoffice/admin.html');
});

app.get('/orders', (req, res) => {
  res.redirect(302, '/backoffice/orders.html');
});

app.get('/orders.html', (req, res) => {
  res.redirect(302, '/backoffice/orders.html');
});

app.get('/review', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review.html'));
});

app.get('/backoffice/*', (req, res) => {
  res.redirect(302, '/backoffice/admin.html');
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Jewelry store running at http://localhost:${port}`);
});
