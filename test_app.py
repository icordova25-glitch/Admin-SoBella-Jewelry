import importlib.util
import json
import os
import tempfile
import unittest


ROOT = os.path.dirname(os.path.abspath(__file__))


class StorefrontTests(unittest.TestCase):
    def test_server_module_exists(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(hasattr(module, 'load_products'))
        self.assertTrue(hasattr(module, 'update_product'))

    def test_update_product_restock(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.PRODUCTS_PATH = os.path.join(temp_dir, 'products.json')
            module.ORDERS_PATH = os.path.join(temp_dir, 'orders.json')
            module.BIO_PATH = os.path.join(temp_dir, 'business-bio.json')
            module.DATA_DIR = temp_dir
            with open(module.PRODUCTS_PATH, 'w', encoding='utf-8') as fh:
                json.dump([{"sku": "TEST-1", "category": "rings", "name": "Test Ring", "description": "", "price": 10, "stock": 2}], fh)
            with open(module.ORDERS_PATH, 'w', encoding='utf-8') as fh:
                fh.write('[]')

            updated = module.update_product('TEST-1', {'operation': 'restock'})
            self.assertEqual(updated['stock'], 3)

    def test_ensure_data_files_creates_business_bio(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.PRODUCTS_PATH = os.path.join(temp_dir, 'products.json')
            module.ORDERS_PATH = os.path.join(temp_dir, 'orders.json')
            module.BIO_PATH = os.path.join(temp_dir, 'business-bio.json')
            module.DATA_DIR = temp_dir

            module.ensure_data_files()

            with open(module.BIO_PATH, 'r', encoding='utf-8') as fh:
                data = json.load(fh)
            self.assertIn('bio', data)
            self.assertTrue(data['bio'])

    def test_process_payment_accepts_valid_card_and_rejects_invalid_card(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        success, message = module.process_payment('card', {
            'cardNumber': '4242424242424242',
            'expiry': '12/30',
            'cvc': '123',
        })
        self.assertTrue(success)
        self.assertIn('processed', message.lower())

        failed, error = module.process_payment('card', {
            'cardNumber': '4111111111111111',
            'expiry': '01/20',
            'cvc': '12',
        })
        self.assertFalse(failed)
        self.assertIn('failed', error.lower())

    def test_delete_product_removes_it_from_inventory(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.PRODUCTS_PATH = os.path.join(temp_dir, 'products.json')
            module.ORDERS_PATH = os.path.join(temp_dir, 'orders.json')
            module.BIO_PATH = os.path.join(temp_dir, 'business-bio.json')
            module.DATA_DIR = temp_dir
            with open(module.PRODUCTS_PATH, 'w', encoding='utf-8') as fh:
                json.dump([{"sku": "TEST-2", "category": "rings", "name": "Delete Me", "description": "", "price": 10, "stock": 2}], fh)
            with open(module.ORDERS_PATH, 'w', encoding='utf-8') as fh:
                fh.write('[]')

            result = module.update_product('TEST-2', {'operation': 'delete'})
            self.assertTrue(result['deleted'])
            self.assertEqual(module.load_products(), [])

    def test_save_uploaded_image_writes_file_and_returns_url(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.UPLOADS_DIR = os.path.join(temp_dir, 'uploads')
            module.ensure_data_files()
            image_url = module.save_uploaded_image({
                'filename': 'sample.png',
                'content': 'dGVzdA=='
            })
            self.assertTrue(image_url.startswith('/uploads/'))
            self.assertTrue(os.path.exists(os.path.join(temp_dir, 'uploads', os.path.basename(image_url))))

    def test_save_uploaded_image_accepts_data_url_payload(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.UPLOADS_DIR = os.path.join(temp_dir, 'uploads')
            module.ensure_data_files()
            image_url = module.save_uploaded_image({
                'filename': 'sample.png',
                'content': 'data:image/png;base64,dGVzdA=='
            })
            self.assertTrue(image_url.startswith('/uploads/'))
            saved_path = os.path.join(temp_dir, 'uploads', os.path.basename(image_url))
            self.assertTrue(os.path.exists(saved_path))
            with open(saved_path, 'rb') as fh:
                self.assertIn(b'test', fh.read())

    def test_bank_info_save_and_load(self):
        spec = importlib.util.spec_from_file_location('server', os.path.join(ROOT, 'server.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as temp_dir:
            module.DATA_DIR = temp_dir
            module.BANK_INFO_PATH = os.path.join(temp_dir, 'bank-info.json')
            payload = {
                'accountHolder': 'SoBella Jewelry',
                'bankName': 'Example Bank',
                'accountNumber': '123456789',
                'routingNumber': '987654321',
            }
            saved = module.save_business_bank_info(payload)
            self.assertEqual(saved['accountHolder'], payload['accountHolder'])
            self.assertEqual(module.load_business_bank_info()['bankName'], payload['bankName'])


if __name__ == '__main__':
    unittest.main()
