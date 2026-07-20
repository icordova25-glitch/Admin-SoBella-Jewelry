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


class BackofficeHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.is_authorized():
            self.send_unauthorized()
            return
        self.dispatch_request(include_body=True)

    def do_HEAD(self):
        if not self.is_authorized():
            self.send_unauthorized(include_body=False)
            return
        self.dispatch_request(include_body=False)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_POST(self):
        if not self.is_authorized():
            self.send_unauthorized()
            return

        parsed = urlparse(self.path)
        if parsed.path == '/api/admin/products':
            self.handle_admin_product_create()
        elif parsed.path == '/api/business-bio':
            self.handle_business_bio_save()
        elif parsed.path == '/api/business-bank-info':
            self.handle_business_bank_info_save()
        else:
            self.send_not_found()

    def do_PUT(self):
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
        return separator == ':' and username == BACKOFFICE_USERNAME and password == BACKOFFICE_PASSWORD

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
    server = ThreadingHTTPServer(('0.0.0.0', BACKOFFICE_PORT), BackofficeHandler)
    print(f'Backoffice running at http://localhost:{BACKOFFICE_PORT}/backoffice/admin.html')
    print(f'Credentials: {BACKOFFICE_USERNAME} / {BACKOFFICE_PASSWORD}')
    server.serve_forever()


if __name__ == '__main__':
    main()
