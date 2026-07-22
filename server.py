import base64
import json
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import stripe
except ImportError:  # pragma: no cover
    stripe = None

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DATA_DIR = ROOT / 'data'
UPLOADS_DIR = ROOT / 'uploads'
PRODUCTS_PATH = DATA_DIR / 'products.json'
ORDERS_PATH = DATA_DIR / 'orders.json'
BIO_PATH = DATA_DIR / 'business-bio.json'
BANK_INFO_PATH = DATA_DIR / 'bank-info.json'
SITE_ACCESS_PATH = DATA_DIR / 'site-access.json'


def resolve_path(path_value):
    if isinstance(path_value, Path):
        return path_value
    return Path(path_value)

DEFAULT_PRODUCTS = [
    {'sku': 'EARR-001', 'category': 'earings', 'name': 'Pearl Drop Earrings', 'description': 'Elegant pearl earrings for special occasions.', 'price': 89, 'stock': 12},
    {'sku': 'NECK-001', 'category': 'necklaces', 'name': 'Gold Chain Necklace', 'description': 'Layered gold necklace with a modern finish.', 'price': 120, 'stock': 8},
    {'sku': 'RING-001', 'category': 'rings', 'name': 'Diamond Accent Ring', 'description': 'A refined ring with a subtle sparkle.', 'price': 150, 'stock': 5},
    {'sku': 'BRACE-001', 'category': 'bracelets', 'name': 'Silver Cuff Bracelet', 'description': 'A polished bracelet with a timeless finish.', 'price': 95, 'stock': 7},
]


def read_json(path):
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def write_json(path, data):
    with path.open('w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)


def infer_category(name, sku):
    name_lower = (name or sku or '').lower()
    if 'neck' in name_lower:
        return 'necklaces'
    if 'ring' in name_lower:
        return 'rings'
    if 'ear' in name_lower:
        return 'earings'
    if 'brace' in name_lower:
        return 'bracelets'
    return 'necklaces'


def normalize_products(products):
    normalized = []
    for product in products:
        normalized.append({
            'sku': product.get('sku', ''),
            'category': product.get('category') or infer_category(product.get('name', ''), product.get('sku', '')),
            'name': product.get('name', 'Untitled product'),
            'description': product.get('description', ''),
            'price': product.get('price', 0),
            'stock': product.get('stock', 0),
            'image': product.get('image', ''),
        })
    return normalized


def ensure_data_files():
    data_dir_path = resolve_path(DATA_DIR)
    uploads_dir = resolve_path(UPLOADS_DIR)
    products_path = resolve_path(PRODUCTS_PATH)
    orders_path = resolve_path(ORDERS_PATH)
    bio_path = resolve_path(BIO_PATH)
    bank_info_path = resolve_path(BANK_INFO_PATH)
    data_dir_path.mkdir(exist_ok=True)
    uploads_dir.mkdir(exist_ok=True)

    if not products_path.exists():
        write_json(products_path, DEFAULT_PRODUCTS)
        products = list(DEFAULT_PRODUCTS)
    else:
        try:
            products = read_json(products_path)
        except json.JSONDecodeError:
            products = []
        if not isinstance(products, list):
            products = []
        normalized = normalize_products(products)
        if normalized != products:
            write_json(products_path, normalized)
            products = normalized

    if not orders_path.exists():
        write_json(orders_path, [])

    if not bio_path.exists():
        write_json(bio_path, {'bio': 'SoBella Jewelry creates timeless, elegant pieces that celebrate modern love, personal style, and everyday luxury.'})

    if not bank_info_path.exists():
        write_json(bank_info_path, {
            'accountHolder': '',
            'bankName': '',
            'accountNumber': '',
            'routingNumber': '',
        })

    site_access_path = resolve_path(SITE_ACCESS_PATH)
    if not site_access_path.exists():
        write_json(site_access_path, {
            'enabled': True,
            'reason': '',
            'updatedAt': None,
        })


def load_site_access():
    ensure_data_files()
    try:
        data = read_json(resolve_path(SITE_ACCESS_PATH))
    except Exception:
        data = {}
    return {
        'enabled': data.get('enabled', True) is not False,
        'reason': str(data.get('reason', '')),
        'updatedAt': data.get('updatedAt'),
    }


def save_site_access(enabled, reason=''):
    payload = {
        'enabled': bool(enabled),
        'reason': str(reason or ''),
        'updatedAt': datetime.now(timezone.utc).isoformat(),
    }
    write_json(resolve_path(SITE_ACCESS_PATH), payload)
    return payload


def get_site_base_url():
    return str(os.getenv('SITE_URL', 'http://localhost:3000')).rstrip('/')


def save_uploaded_image(uploaded_file):
    if not uploaded_file:
        return ''

    filename = uploaded_file.get('filename', '')
    if not filename:
        return ''

    content = uploaded_file.get('content', '')
    if not content:
        return ''

    ext = Path(filename).suffix.lower()
    safe_name = f"{Path(filename).stem}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{ext}"
    destination = resolve_path(UPLOADS_DIR) / safe_name

    if isinstance(content, str):
        if content.startswith('data:'):
            header, _, encoded = content.partition(',')
            if ';base64' in header.lower():
                content = encoded
            else:
                content = content
        try:
            content_bytes = base64.b64decode(content)
        except Exception:
            content_bytes = content.encode('utf-8')
    else:
        content_bytes = content

    with destination.open('wb') as fh:
        fh.write(content_bytes)
    return f'/uploads/{safe_name}'


def load_products():
    ensure_data_files()
    return read_json(resolve_path(PRODUCTS_PATH))


def build_sitemap_xml():
    base_url = get_site_base_url()
    paths = ['/']
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path in paths:
        lines.append('  <url>')
        lines.append(f'    <loc>{base_url}{path}</loc>')
        lines.append('  </url>')
    lines.append('</urlset>')
    return '\n'.join(lines)


def build_product_schema_markup(products):
    base_url = get_site_base_url()
    schema_items = []
    for product in products:
        image_url = product.get('image', '')
        if image_url and not image_url.startswith('http'):
            image_url = f'{base_url}{image_url}'
        schema_items.append({
            '@context': 'https://schema.org',
            '@type': 'Product',
            'name': product.get('name', ''),
            'description': product.get('description', ''),
            'sku': product.get('sku', ''),
            'category': product.get('category', ''),
            'offers': {
                '@type': 'Offer',
                'priceCurrency': 'USD',
                'price': str(product.get('price', 0)),
                'availability': 'https://schema.org/InStock' if int(product.get('stock', 0)) > 0 else 'https://schema.org/OutOfStock',
            },
        })
        if image_url:
            schema_items[-1]['image'] = image_url
    return schema_items


def load_business_bio():
    ensure_data_files()
    return read_json(resolve_path(BIO_PATH))


def save_business_bio(bio):
    payload = {'bio': bio[:500]}
    write_json(resolve_path(BIO_PATH), payload)
    return payload


def load_business_bank_info():
    ensure_data_files()
    return read_json(resolve_path(BANK_INFO_PATH))


def save_business_bank_info(payload):
    data = {
        'accountHolder': str(payload.get('accountHolder', '')).strip(),
        'bankName': str(payload.get('bankName', '')).strip(),
        'accountNumber': str(payload.get('accountNumber', '')).strip(),
        'routingNumber': str(payload.get('routingNumber', '')).strip(),
    }
    write_json(resolve_path(BANK_INFO_PATH), data)
    return data


def update_product(sku, updates):
    products = load_products()
    for product in products:
        if product['sku'] == sku:
            operation = updates.get('operation')
            if operation == 'restock':
                product['stock'] = int(product.get('stock', 0)) + 1
            elif operation == 'decrease':
                product['stock'] = max(0, int(product.get('stock', 0)) - 1)
            elif operation == 'delete':
                products.remove(product)
                write_json(resolve_path(PRODUCTS_PATH), products)
                return {'deleted': True, 'sku': sku}
            else:
                for key in ('name', 'description', 'price', 'stock', 'category'):
                    if key in updates:
                        if key == 'stock':
                            product[key] = int(updates[key])
                        else:
                            product[key] = updates[key]
            if 'price' in updates and 'price' not in ('restock', 'decrease', 'delete'):
                product['price'] = updates['price']
            if 'category' in updates and updates.get('operation') not in ('restock', 'decrease', 'delete'):
                product['category'] = updates['category']
            if 'description' in updates and updates.get('operation') not in ('restock', 'decrease', 'delete'):
                product['description'] = updates['description']
            if 'name' in updates and updates.get('operation') not in ('restock', 'decrease', 'delete'):
                product['name'] = updates['name']
            write_json(resolve_path(PRODUCTS_PATH), products)
            return product
    raise KeyError(f'Product {sku} not found')


def create_order(customer_name, email, items, payment_method='card', payment_id=None, source='manual'):
    products = load_products()
    inventory_by_sku = {product['sku']: product for product in products}
    ordered_items = []

    for item in items:
        qty = int(item.get('quantity', 1))
        product = inventory_by_sku.get(item['sku'])
        if not product:
            raise ValueError(f"Product {item['sku']} was not found.")
        if product['stock'] < qty:
            raise ValueError(f"Not enough stock for {product['name']}.")
        product['stock'] -= qty
        ordered_items.append({
            'sku': product['sku'],
            'name': product['name'],
            'quantity': qty,
            'price': product['price'],
            'lineTotal': product['price'] * qty,
        })

    subtotal = sum(item['lineTotal'] for item in ordered_items)
    shipping = 12 if subtotal > 0 else 0
    total = subtotal + shipping

    ensure_data_files()
    orders = read_json(resolve_path(ORDERS_PATH))
    if payment_id:
        for existing in orders:
            if existing.get('paymentId') == payment_id:
                return existing

    order = {
        'id': f"ORD-{len(orders) + 1}",
        'customerName': customer_name,
        'email': email,
        'items': ordered_items,
        'paymentMethod': payment_method,
        'status': 'paid',
        'total': total,
        'source': source,
        'paymentId': payment_id,
        'createdAt': datetime.now(timezone.utc).isoformat(),
    }
    orders.insert(0, order)
    write_json(resolve_path(PRODUCTS_PATH), products)
    write_json(resolve_path(ORDERS_PATH), orders)
    return order


def send_order_confirmation(order):
    smtp_host = os.getenv('SMTP_HOST')
    if not smtp_host:
        print(f"Email confirmation skipped for {order['email']}")
        return True

    smtp_port = int(os.getenv('SMTP_PORT', '587'))
    smtp_username = os.getenv('SMTP_USERNAME')
    smtp_password = os.getenv('SMTP_PASSWORD')
    smtp_from = os.getenv('SMTP_FROM', 'no-reply@sobella.com')

    message = EmailMessage()
    message['Subject'] = f"Your SoBella Jewelry order {order['id']} is confirmed"
    message['From'] = smtp_from
    message['To'] = order['email']
    message.set_content(
        f"Hi {order['customerName']},\n\n"
        f"Your order {order['id']} has been confirmed.\n"
        f"Total: ${order['total']}\n"
        f"We will send tracking details as soon as your jewelry ships."
    )

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_username and smtp_password:
                server.starttls()
                server.login(smtp_username, smtp_password)
            server.send_message(message)
        return True
    except Exception as exc:  # pragma: no cover
        print(f"Email delivery failed: {exc}")
        return False


def get_stripe():
    if not stripe:
        return None
    secret_key = os.getenv('STRIPE_SECRET_KEY')
    if not secret_key:
        return None
    stripe.api_key = secret_key
    return stripe


def process_payment(payment_method, card_data=None):
    if payment_method != 'card':
        return True, 'Bank transfer selected. No card payment required.'

    card_data = card_data or {}
    card_number = str(card_data.get('cardNumber', '')).replace(' ', '')
    expiry = str(card_data.get('expiry', '')).strip()
    cvc = str(card_data.get('cvc', '')).strip()

    if len(card_number) < 12 or len(card_number) > 19:
        return False, 'Payment failed: invalid card number.'
    if len(cvc) < 3:
        return False, 'Payment failed: invalid CVC.'
    if '/' not in expiry:
        return False, 'Payment failed: invalid expiry date.'

    expiry_month, expiry_year = expiry.split('/', 1)
    if not expiry_month.isdigit() or not expiry_year.isdigit():
        return False, 'Payment failed: invalid expiry date.'

    if expiry_month.startswith('0') and len(expiry_month) == 2:
        expiry_month = expiry_month[1:]
    expiry_month = int(expiry_month)
    expiry_year = int(expiry_year)

    if expiry_month < 1 or expiry_month > 12:
        return False, 'Payment failed: invalid expiry month.'

    if expiry_year < 24:
        return False, 'Payment failed: card expired.'

    if card_number.endswith('1111') or card_number.endswith('0000'):
        return False, 'Payment failed: card was declined.'

    return True, 'Payment processed successfully.'


def create_checkout_session(customer_name, email, items, payment_method='card'):
    stripe_client = get_stripe()
    if not stripe_client:
        order = create_order(customer_name, email, items, payment_method, source='demo')
        send_order_confirmation(order)
        return {'success': True, 'order': order, 'checkoutUrl': None, 'demo': True}

    line_items = []
    products = {product['sku']: product for product in load_products()}
    subtotal = 0
    for item in items:
        product = products.get(item['sku'])
        if not product:
            raise ValueError(f"Product {item['sku']} was not found.")
        qty = int(item.get('quantity', 1))
        subtotal += product['price'] * qty
        line_items.append({
            'price_data': {
                'currency': 'usd',
                'product_data': {'name': product['name']},
                'unit_amount': int(product['price'] * 100),
            },
            'quantity': qty,
        })

    shipping = 12 if subtotal > 0 else 0
    if shipping:
        line_items.append({
            'price_data': {
                'currency': 'usd',
                'product_data': {'name': 'Shipping'},
                'unit_amount': int(shipping * 100),
            },
            'quantity': 1,
        })

    success_url = os.getenv('STRIPE_SUCCESS_URL', 'http://localhost:3000/review')
    cancel_url = os.getenv('STRIPE_CANCEL_URL', 'http://localhost:3000/review')
    session = stripe_client.checkout.Session.create(
        mode='payment',
        line_items=line_items,
        customer_email=email,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            'customerName': customer_name,
            'email': email,
            'items': json.dumps(items),
            'paymentMethod': payment_method,
        },
    )
    return {'success': True, 'checkoutUrl': session.url, 'demo': False}


class JewelryHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_GET(self):
        self.dispatch_request(include_body=True)

    def do_HEAD(self):
        self.dispatch_request(include_body=False)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def is_owner_authorized(self):
        secret = str(os.getenv('SITE_ACCESS_TOGGLE_KEY', '')).strip() or str(os.getenv('OWNER_ACCESS_KEY', '')).strip()
        if not secret:
            return False
        return self.headers.get('X-Site-Access-Key', '').strip() == secret

    def write_site_disabled_response(self, include_body=True):
        access = load_site_access()
        if self.path.startswith('/api/'):
            self.send_json({
                'error': 'Site access is currently disabled.',
                'reason': access.get('reason', ''),
                'code': 'SITE_DISABLED',
            }, status=402, include_body=include_body)
            return

        message = access.get('reason') or 'Service is temporarily unavailable due to billing status.'
        html = (
            '<!doctype html><html lang="en"><head><meta charset="utf-8" />'
            '<meta name="viewport" content="width=device-width, initial-scale=1" />'
            '<title>Service Unavailable</title></head><body>'
            '<main style="max-width:560px;margin:4rem auto;padding:1.2rem;border:1px solid #ddd;border-radius:12px;font-family:Arial,sans-serif;">'
            '<h1>Temporarily unavailable</h1>'
            f'<p>{message}</p>'
            '<p>Please contact the site owner to restore access.</p>'
            '</main></body></html>'
        )
        body = html.encode('utf-8')
        self.send_response(402)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def dispatch_request(self, include_body=True):
        parsed = urlparse(self.path)
        site_access = load_site_access()
        always_allowed = {'/api/site-access', '/api/owner/site-access', '/sitemap.xml', '/robots.txt'}
        if parsed.path not in always_allowed and site_access.get('enabled') is False:
            self.write_site_disabled_response(include_body=include_body)
            return

        if parsed.path == '/api/products':
            self.send_json(load_products(), include_body=include_body)
        elif parsed.path == '/api/orders':
            ensure_data_files()
            self.send_json(read_json(resolve_path(ORDERS_PATH)), include_body=include_body)
        elif parsed.path == '/api/admin/products':
            self.send_json(load_products(), include_body=include_body)
        elif parsed.path == '/api/business-bio':
            self.send_json(load_business_bio(), include_body=include_body)
        elif parsed.path == '/api/business-bank-info':
            self.send_json(load_business_bank_info(), include_body=include_body)
        elif parsed.path == '/sitemap.xml':
            self.send_xml(build_sitemap_xml(), include_body=include_body)
        elif parsed.path == '/robots.txt':
            self.send_text(f"User-agent: *\nAllow: /\nDisallow: /backoffice\nSitemap: {get_site_base_url()}/sitemap.xml\n", include_body=include_body)
        elif parsed.path == '/api/schema/products':
            self.send_json(build_product_schema_markup(load_products()), include_body=include_body)
        elif parsed.path == '/api/site-access':
            self.send_json(load_site_access(), include_body=include_body)
        else:
            self.serve_static(parsed.path, include_body=include_body)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/owner/site-access':
            self.handle_owner_site_access()
            return

        site_access = load_site_access()
        if site_access.get('enabled') is False:
            self.write_site_disabled_response(include_body=True)
            return

        if parsed.path == '/api/orders':
            self.handle_order_creation()
        elif parsed.path == '/api/checkout/create-session':
            self.handle_checkout_session()
        elif parsed.path == '/api/stripe/webhook':
            self.handle_webhook()
        elif parsed.path == '/api/admin/products':
            self.handle_admin_product_create()
        elif parsed.path == '/api/business-bio':
            self.handle_business_bio_save()
        elif parsed.path == '/api/business-bank-info':
            self.handle_business_bank_info_save()
        else:
            self.send_response(404)
            self.end_headers()

    def do_PUT(self):
        parsed = urlparse(self.path)
        site_access = load_site_access()
        if site_access.get('enabled') is False:
            self.write_site_disabled_response(include_body=True)
            return

        if parsed.path.startswith('/api/admin/products/'):
            self.handle_admin_product_update(parsed.path)
        else:
            self.send_response(404)
            self.end_headers()

    def handle_owner_site_access(self):
        if not self.is_owner_authorized():
            self.send_json({'error': 'Owner authorization required.'}, status=401)
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else '{}'
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON payload.'}, status=400)
            return

        enabled = data.get('enabled')
        reason = str(data.get('reason', '')).strip()
        if not isinstance(enabled, bool):
            self.send_json({'error': 'enabled must be true or false.'}, status=400)
            return

        updated = save_site_access(enabled, reason)
        self.send_json({'success': True, 'siteAccess': updated})

    def handle_order_creation(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        customer_name = data.get('customerName', '').strip()
        email = data.get('email', '').strip()
        items = data.get('items', [])
        payment_method = data.get('paymentMethod', 'card')

        if not customer_name or not email or not items:
            self.send_json({'error': 'Please complete the checkout form.'}, status=400)
            return

        try:
            order = create_order(customer_name, email, items, payment_method, source='manual')
        except ValueError as exc:
            self.send_json({'error': str(exc)}, status=400)
            return

        send_order_confirmation(order)
        self.send_json({'success': True, 'order': order})

    def handle_checkout_session(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)

        customer_name = data.get('customerName', '').strip()
        email = data.get('email', '').strip()
        items = data.get('items', [])
        payment_method = data.get('paymentMethod', 'card')
        card_data = data.get('cardData', {})

        if not customer_name or not email or not items:
            self.send_json({'error': 'Please complete the checkout form.'}, status=400)
            return

        if payment_method == 'card':
            success, message = process_payment(payment_method, card_data)
            if not success:
                self.send_json({'success': False, 'error': message}, status=400)
                return

        try:
            result = create_checkout_session(customer_name, email, items, payment_method)
        except ValueError as exc:
            self.send_json({'error': str(exc)}, status=400)
            return

        self.send_json({**result, 'paymentStatus': 'processed' if payment_method != 'card' else 'processed'})

    def handle_webhook(self):
        stripe_client = get_stripe()
        if not stripe_client:
            self.send_json({'error': 'Stripe is not configured.'}, status=400)
            return

        payload = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        signature = self.headers.get('Stripe-Signature', '')
        endpoint_secret = os.getenv('STRIPE_WEBHOOK_SECRET', '')
        try:
            event = stripe_client.Webhook.construct_event(payload, signature, endpoint_secret)
        except Exception as exc:  # pragma: no cover
            self.send_json({'error': str(exc)}, status=400)
            return

        if event['type'] == 'checkout.session.completed':
            session = event['data']['object']
            metadata = session.get('metadata') or {}
            items = json.loads(metadata.get('items', '[]'))
            try:
                order = create_order(
                    metadata.get('customerName', ''),
                    metadata.get('email', ''),
                    items,
                    metadata.get('paymentMethod', 'card'),
                    payment_id=session.id,
                    source='stripe',
                )
            except ValueError:
                self.send_json({'error': 'Unable to finalize order'}, status=400)
                return
            send_order_confirmation(order)

        self.send_json({'received': True})

    def handle_business_bio_save(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        self.send_json(save_business_bio(data.get('bio', '')))

    def handle_business_bank_info_save(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        self.send_json(save_business_bank_info(data))

    def handle_admin_product_create(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        image_path = ''
        if data.get('imageFile'):
            image_path = save_uploaded_image(data.get('imageFile'))
        product = {
            'sku': data.get('sku', ''),
            'category': data.get('category', 'necklaces'),
            'name': data.get('name', 'Untitled'),
            'description': data.get('description', ''),
            'price': data.get('price', 0),
            'stock': data.get('stock', 0),
            'image': image_path,
        }
        products = load_products()
        products.append(product)
        write_json(resolve_path(PRODUCTS_PATH), products)
        self.send_json({'success': True, 'product': product})

    def handle_admin_product_update(self, path):
        sku = path.rsplit('/', 1)[-1]
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8')
        data = json.loads(body)
        try:
            updated = update_product(sku, data)
        except KeyError as exc:
            self.send_json({'error': str(exc)}, status=404)
            return
        self.send_json({'success': True, 'product': updated})

    def serve_static(self, path, include_body=True):
        if path in ('', '/'):
            path = '/index.html'
        if path.startswith('/assets/'):
            asset_path = PUBLIC / path.lstrip('/')
            if asset_path.exists():
                self.send_file(asset_path, include_body=include_body)
                return
        if path.startswith('/uploads/'):
            upload_path = ROOT / path.lstrip('/')
            if upload_path.exists():
                self.send_file(upload_path, include_body=include_body)
                return
        if path in ('/admin', '/admin.html'):
            self.send_not_found()
            return
        if path in ('/review', '/review.html'):
            self.send_file(PUBLIC / 'review.html', include_body=include_body)
            return
        if path in ('/orders', '/orders.html'):
            self.send_not_found()
            return
        if path in ('/backoffice', '/backoffice/') or path.startswith('/backoffice/'):
            self.send_not_found()
            return
        if path in ('/styles.css', '/app.js', '/review.js'):
            self.send_file(PUBLIC / path.lstrip('/'), include_body=include_body)
            return
        file_path = PUBLIC / path.lstrip('/')
        if file_path.exists() and file_path.is_file():
            self.send_file(file_path, include_body=include_body)
            return
        index_path = PUBLIC / 'index.html'
        self.send_file(index_path, include_body=include_body)

    def send_file(self, file_path, include_body=True):
        suffix = file_path.suffix.lower()
        if suffix == '.html':
            content_type = 'text/html; charset=utf-8'
        elif suffix == '.css':
            content_type = 'text/css; charset=utf-8'
        elif suffix == '.js':
            content_type = 'application/javascript; charset=utf-8'
        elif suffix == '.png':
            content_type = 'image/png'
        elif suffix in {'.jpg', '.jpeg'}:
            content_type = 'image/jpeg'
        elif suffix == '.gif':
            content_type = 'image/gif'
        elif suffix == '.svg':
            content_type = 'image/svg+xml'
        elif suffix == '.webp':
            content_type = 'image/webp'
        else:
            content_type = 'application/octet-stream'
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_json(self, payload, status=200, include_body=True):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_xml(self, payload, status=200, include_body=True):
        body = payload.encode('utf-8')
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'application/xml; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_text(self, payload, status=200, include_body=True):
        body = payload.encode('utf-8')
        self.send_response(status)
        self.send_cors_headers()
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_not_found(self, include_body=True):
        body = b'Not Found'
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def main():
    ensure_data_files()
    server = ThreadingHTTPServer(('0.0.0.0', 3000), JewelryHandler)
    print('Jewelry store running at http://localhost:3000')
    server.serve_forever()


if __name__ == '__main__':
    main()
