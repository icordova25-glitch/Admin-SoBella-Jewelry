import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from server import (
    ORDERS_PATH,
    PRODUCTS_PATH,
    ROOT,
    ensure_data_files,
    load_business_bank_info,
    load_business_bio,
    load_products,
    load_site_access,
    save_site_access,
    read_json,
    resolve_path,
    save_business_bank_info,
    save_business_bio,
    save_uploaded_image,
    update_product,
    write_json,
)

BACKOFFICE_PORT = int(os.getenv('BACKOFFICE_PORT', '3001'))
BACKOFFICE_USERNAME = os.getenv('BACKOFFICE_USERNAME', 'admin')
BACKOFFICE_PASSWORD = os.getenv('BACKOFFICE_PASSWORD', 'sobella-admin')
BACKOFFICE_AUTH_PATH = ROOT / 'data' / 'backoffice-auth.json'


def ensure_backoffice_auth_file():
    ensure_data_files()
    if not BACKOFFICE_AUTH_PATH.exists():
        write_json(BACKOFFICE_AUTH_PATH, {
            'username': BACKOFFICE_USERNAME,
            'password': BACKOFFICE_PASSWORD,
        })


def load_backoffice_credentials():
    ensure_backoffice_auth_file()
    try:
        data = read_json(BACKOFFICE_AUTH_PATH)
    except Exception:
        data = {}

    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))
    if not username or not password:
        username = BACKOFFICE_USERNAME
        password = BACKOFFICE_PASSWORD
        write_json(BACKOFFICE_AUTH_PATH, {
            'username': username,
            'password': password,
        })
    return {
        'username': username,
        'password': password,
    }


def validate_password_strength(password):
    if len(password) < 8:
        return False
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    has_digit = any(char.isdigit() for char in password)
    has_special = any(not char.isalnum() for char in password)
    return has_upper and has_lower and has_digit and has_special


class BackofficeHandler(BaseHTTPRequestHandler):
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

        body = b'Site temporarily unavailable due to billing status.'
        self.send_response(402)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/owner/site-access' and load_site_access().get('enabled') is False:
            self.write_site_disabled_response()
            return
        if parsed.path.startswith('/api/') and not self.is_authorized():
            self.send_unauthorized()
            return
        self.dispatch_request(include_body=True)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path != '/api/owner/site-access' and load_site_access().get('enabled') is False:
            self.write_site_disabled_response(include_body=False)
            return
        if parsed.path.startswith('/api/') and not self.is_authorized():
            self.send_unauthorized(include_body=False)
            return
        self.dispatch_request(include_body=False)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/owner/site-access':
            self.handle_owner_site_access()
            return

        if load_site_access().get('enabled') is False:
            self.write_site_disabled_response()
            return

        if not self.is_authorized():
            self.send_unauthorized()
            return

        if parsed.path == '/api/admin/products':
            self.handle_admin_product_create()
        elif parsed.path == '/api/business-bio':
            self.handle_business_bio_save()
        elif parsed.path == '/api/business-bank-info':
            self.handle_business_bank_info_save()
        elif parsed.path == '/api/backoffice/credentials':
            self.handle_backoffice_credentials_save()
        else:
            self.send_not_found()

    def do_PUT(self):
        if load_site_access().get('enabled') is False:
            self.write_site_disabled_response()
            return

        if not self.is_authorized():
            self.send_unauthorized()
            return

        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/admin/products/'):
            self.handle_admin_product_update(parsed.path)
        else:
            self.send_not_found()

    def is_authorized(self):
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Basic '):
            return False

        encoded = auth_header.split(' ', 1)[1].strip()
        try:
            decoded = base64.b64decode(encoded).decode('utf-8')
        except Exception:
            return False

        username, separator, password = decoded.partition(':')
        if separator != ':':
            return False
        credentials = load_backoffice_credentials()
        return username == credentials['username'] and password == credentials['password']

    def dispatch_request(self, include_body=True):
        parsed = urlparse(self.path)
        if parsed.path in ('', '/', '/backoffice', '/backoffice/'):
            self.send_redirect('/backoffice/admin.html')
            return
        if parsed.path == '/api/admin/products':
            self.send_json(load_products(), include_body=include_body)
            return
        if parsed.path == '/api/orders':
            ensure_data_files()
            self.send_json(read_json(resolve_path(ORDERS_PATH)), include_body=include_body)
            return
        if parsed.path == '/api/business-bio':
            self.send_json(load_business_bio(), include_body=include_body)
            return
        if parsed.path == '/api/business-bank-info':
            self.send_json(load_business_bank_info(), include_body=include_body)
            return
        if parsed.path == '/api/site-access':
            self.send_json(load_site_access(), include_body=include_body)
            return
        if parsed.path == '/api/backoffice/credentials':
            credentials = load_backoffice_credentials()
            self.send_json({'username': credentials['username']}, include_body=include_body)
            return
        if parsed.path.startswith('/public/'):
            asset_path = ROOT / parsed.path.lstrip('/')
            if asset_path.exists() and asset_path.is_file():
                self.send_file(asset_path, include_body=include_body)
                return
        if parsed.path.startswith('/uploads/'):
            upload_path = ROOT / parsed.path.lstrip('/')
            if upload_path.exists() and upload_path.is_file():
                self.send_file(upload_path, include_body=include_body)
                return
        if parsed.path.startswith('/backoffice/'):
            file_path = ROOT / parsed.path.lstrip('/')
            if file_path.exists() and file_path.is_file():
                self.send_file(file_path, include_body=include_body)
                return
        self.send_not_found(include_body=include_body)

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

    def handle_backoffice_credentials_save(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode('utf-8') if length else '{}'
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON payload.'}, status=400)
            return

        username = str(data.get('username', '')).strip()
        password = str(data.get('password', ''))

        if not username:
            self.send_json({'error': 'Username is required.'}, status=400)
            return

        if not validate_password_strength(password):
            self.send_json({'error': 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'}, status=400)
            return

        write_json(BACKOFFICE_AUTH_PATH, {
            'username': username,
            'password': password,
        })
        self.send_json({'success': True, 'username': username})

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

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

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
        self.send_cors_headers()
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

    def send_redirect(self, location):
        self.send_response(302)
        self.send_header('Location', location)
        self.end_headers()

    def send_not_found(self, include_body=True):
        body = b'Not Found'
        self.send_response(404)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_unauthorized(self, include_body=True):
        body = b'Authentication required'
        self.send_response(401)
        self.send_cors_headers()
        self.send_header('WWW-Authenticate', 'Basic realm="SoBella Backoffice"')
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def main():
    ensure_data_files()
    ensure_backoffice_auth_file()
    credentials = load_backoffice_credentials()
    server = ThreadingHTTPServer(('0.0.0.0', BACKOFFICE_PORT), BackofficeHandler)
    print(f'Backoffice running at http://localhost:{BACKOFFICE_PORT}/backoffice/admin.html')
    print(f"Credentials: {credentials['username']} / {credentials['password']}")
    server.serve_forever()


if __name__ == '__main__':
    main()
