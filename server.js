const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;
const sourceDataDir = path.join(__dirname, 'data');

function canWriteToDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    const probe = path.join(dirPath, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch (error) {
    return false;
  }
}

function resolveRuntimeBaseDir() {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }

  if (canWriteToDir(sourceDataDir)) {
    return sourceDataDir;
  }

  return path.join(os.tmpdir(), 'sobella-data');
}

const runtimeBaseDir = resolveRuntimeBaseDir();
const dataDir = runtimeBaseDir;
const productsPath = path.join(dataDir, 'products.json');
const ordersPath = path.join(dataDir, 'orders.json');
const bioPath = path.join(dataDir, 'business-bio.json');
const bankInfoPath = path.join(dataDir, 'bank-info.json');
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(runtimeBaseDir, 'uploads');
const backofficeUser = process.env.BACKOFFICE_USERNAME || 'admin';
const backofficePass = process.env.BACKOFFICE_PASSWORD || 'sobella-admin';

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

app.use(express.json());

function seedRuntimeFile(fileName, fallback) {
  const runtimePath = path.join(dataDir, fileName);
  if (fs.existsSync(runtimePath)) {
    return;
  }

  const sourcePath = path.join(sourceDataDir, fileName);
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, runtimePath);
    return;
  }

  writeJson(runtimePath, fallback);
}

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadsDir, { recursive: true });

  seedRuntimeFile('products.json', defaultProducts);
  seedRuntimeFile('orders.json', []);
  seedRuntimeFile('business-bio.json', {
    bio: 'SoBella Jewelry creates timeless, elegant pieces that celebrate modern love, personal style, and everyday luxury.',
  });
  seedRuntimeFile('bank-info.json', {
    accountHolder: '',
    bankName: '',
    accountNumber: '',
    routingNumber: '',
  });
}

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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getAuthCredentials(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch (error) {
    return null;
  }
}

function requireBackofficeAuth(req, res, next) {
  const credentials = getAuthCredentials(req);
  if (!credentials || credentials.username !== backofficeUser || credentials.password !== backofficePass) {
    res.set('WWW-Authenticate', 'Basic realm="SoBella Backoffice"');
    return res.status(401).send('Authentication required');
  }
  return next();
}

function saveUploadedImage(imageFile) {
  if (!imageFile || !imageFile.filename || !imageFile.content) {
    return '';
  }

  const ext = path.extname(imageFile.filename).toLowerCase() || '.png';
  const baseName = path.basename(imageFile.filename, ext).replace(/[^a-zA-Z0-9_-]/g, '');
  const safeName = `${baseName || 'product'}-${Date.now()}${ext}`;
  const targetPath = path.join(uploadsDir, safeName);

  let rawContent = imageFile.content;
  if (typeof rawContent === 'string' && rawContent.includes(',')) {
    const parts = rawContent.split(',');
    rawContent = parts[parts.length - 1];
  }

  const buffer = Buffer.from(rawContent, 'base64');
  fs.writeFileSync(targetPath, buffer);
  return `/uploads/${safeName}`;
}

function applyProductUpdate(products, sku, updates) {
  const product = products.find((item) => item.sku === sku);
  if (!product) {
    return null;
  }

  const operation = updates.operation;
  if (operation === 'restock') {
    product.stock = Number(product.stock || 0) + 1;
    return { success: true, product };
  }
  if (operation === 'decrease') {
    product.stock = Math.max(0, Number(product.stock || 0) - 1);
    return { success: true, product };
  }
  if (operation === 'delete') {
    const index = products.findIndex((item) => item.sku === sku);
    products.splice(index, 1);
    return { success: true, deleted: true, sku };
  }

  for (const field of ['name', 'description', 'category']) {
    if (updates[field] !== undefined) {
      product[field] = updates[field];
    }
  }
  if (updates.price !== undefined) {
    product.price = Number(updates.price);
  }
  if (updates.stock !== undefined) {
    product.stock = Number(updates.stock);
  }

  return { success: true, product };
}

app.use('/uploads', express.static(uploadsDir));
app.use('/backoffice', express.static(path.join(__dirname, 'backoffice')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

ensureDataFiles();

app.get('/api/products', (req, res) => {
  res.json(readJson(productsPath, []));
});

app.post('/api/orders', (req, res) => {
  const { customerName, email, items, paymentMethod } = req.body;

  if (!customerName || !email || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Please complete the checkout form.' });
  }

  const products = readJson(productsPath, []);
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

  const orders = readJson(ordersPath, []);
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
  writeJson(productsPath, products);
  writeJson(ordersPath, orders);

  res.json({ success: true, order: newOrder });
});

app.get('/api/orders', (req, res) => {
  res.json(readJson(ordersPath, []));
});

app.get('/api/admin/products', requireBackofficeAuth, (req, res) => {
  res.json(readJson(productsPath, []));
});

app.post('/api/admin/products', requireBackofficeAuth, (req, res) => {
  const data = req.body || {};
  const products = readJson(productsPath, []);
  const product = {
    sku: data.sku || '',
    category: data.category || 'necklaces',
    name: data.name || 'Untitled',
    description: data.description || '',
    price: Number(data.price || 0),
    stock: Number(data.stock || 0),
    image: data.imageFile ? saveUploadedImage(data.imageFile) : '',
  };
  products.push(product);
  writeJson(productsPath, products);
  res.json({ success: true, product });
});

app.put('/api/admin/products/:sku', requireBackofficeAuth, (req, res) => {
  const products = readJson(productsPath, []);
  const result = applyProductUpdate(products, req.params.sku, req.body || {});
  if (!result) {
    return res.status(404).json({ error: `Product ${req.params.sku} not found` });
  }
  writeJson(productsPath, products);
  return res.json(result);
});

app.get('/api/business-bio', (req, res) => {
  res.json(readJson(bioPath, { bio: '' }));
});

app.post('/api/business-bio', requireBackofficeAuth, (req, res) => {
  const payload = { bio: String((req.body && req.body.bio) || '').slice(0, 500) };
  writeJson(bioPath, payload);
  res.json(payload);
});

app.get('/api/business-bank-info', requireBackofficeAuth, (req, res) => {
  res.json(
    readJson(bankInfoPath, {
      accountHolder: '',
      bankName: '',
      accountNumber: '',
      routingNumber: '',
    }),
  );
});

app.post('/api/business-bank-info', requireBackofficeAuth, (req, res) => {
  const payload = {
    accountHolder: String((req.body && req.body.accountHolder) || '').trim(),
    bankName: String((req.body && req.body.bankName) || '').trim(),
    accountNumber: String((req.body && req.body.accountNumber) || '').trim(),
    routingNumber: String((req.body && req.body.routingNumber) || '').trim(),
  };
  writeJson(bankInfoPath, payload);
  res.json(payload);
});

app.get('/admin', (req, res) => {
  res.redirect('/backoffice/admin.html');
});

app.get('/orders', (req, res) => {
  res.redirect('/backoffice/orders.html');
});

app.get('/backoffice', (req, res) => {
  res.redirect('/backoffice/admin.html');
});

app.get('/', (req, res) => {
  const host = String(req.headers.host || '').toLowerCase();
  if (host.includes('admin-so-bella-jewelry.vercel.app')) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/shop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/review', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Jewelry store running at http://localhost:${port}`);
  });
}

module.exports = {
  app,
  ensureDataFiles,
};
