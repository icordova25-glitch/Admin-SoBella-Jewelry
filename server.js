const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
const productsPath = path.join(dataDir, 'products.json');
const ordersPath = path.join(dataDir, 'orders.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/admin', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/orders', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/backoffice', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/backoffice/*', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/review', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'review.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Jewelry store running at http://localhost:${port}`);
});
