import hashlib
from pathlib import Path
import unittest
from unittest.mock import patch
import adapter

ENGINE = Path(__file__).resolve().parent.parent / 'v18-authority-prototype/prototype.sql'


class AdapterSafety(unittest.TestCase):
    def test_exact_source_two_transformations_single_transaction(self):
        original = ENGINE.read_bytes()
        sql, evidence = adapter.build(original)
        self.assertEqual(hashlib.sha256(original).hexdigest(), adapter.ENGINE_SHA256)
        self.assertEqual(len(evidence['exact_transformations']), 2)
        self.assertTrue(sql.startswith('BEGIN;\n'))
        self.assertTrue(sql.endswith('\nCOMMIT;\n'))
        self.assertNotIn(adapter.OLD_GUARD, sql)
        self.assertNotIn(adapter.OLD_EXTENSION, sql)
        self.assertEqual(sql.count(adapter.NEW_GUARD), 1)
        self.assertEqual(sql.count(adapter.NEW_EXTENSION), 1)
        self.assertEqual(ENGINE.read_bytes(), original)
        self.assertEqual(evidence['transaction_sha256'], hashlib.sha256(sql.encode()).hexdigest())

    def test_explicit_socket_admin_guard_no_null_port_bypass(self):
        self.assertIn('inet_server_port() IS NOT DISTINCT FROM 5432 AND inet_client_addr() IS NOT NULL', adapter.NEW_GUARD)
        self.assertIn('inet_server_port() IS NULL AND inet_client_addr() IS NULL', adapter.NEW_GUARD)
        self.assertIn("session_user='supabase_admin' AND current_user='supabase_admin'", adapter.NEW_GUARD)
        self.assertIn('rolname=current_user AND rolsuper', adapter.NEW_GUARD)
        self.assertNotIn('inet_server_port()<>5432', adapter.NEW_GUARD)

    def test_source_drift_refused(self):
        with self.assertRaisesRegex(ValueError, 'source hash'):
            adapter.build(ENGINE.read_bytes() + b'\n')

    def test_replacement_count_refused_even_if_digest_pin_were_changed(self):
        for bad in (ENGINE.read_bytes().replace(adapter.OLD_EXTENSION.encode(), b''),
                    ENGINE.read_bytes() + adapter.OLD_EXTENSION.encode()):
            with patch.object(adapter, 'ENGINE_SHA256', hashlib.sha256(bad).hexdigest()):
                with self.assertRaisesRegex(ValueError, 'transformation count'):
                    adapter.build(bad)

    def test_real_subject_null_denial_and_shared_auth_unchanged_assertion(self):
        self.assertIn('subject uuid:=auth.uid()', adapter.ADAPTER)
        self.assertIn("IF subject IS NULL THEN RAISE EXCEPTION 'prototype:unauthenticated'", adapter.ADAPTER)
        self.assertIn('IS DISTINCT FROM pg_get_functiondef', adapter.ADAPTER)
        self.assertNotIn('FUNCTION auth.uid()', adapter.ADAPTER.split('GRANT')[0])

    def test_facade_is_invoker_and_extension_member_checked(self):
        self.assertIn("d.deptype='e'", adapter.NEW_EXTENSION)
        self.assertIn("e.extname='pgcrypto'", adapter.NEW_EXTENSION)
        self.assertIn('SECURITY INVOKER SET search_path=pg_catalog', adapter.NEW_EXTENSION)
        self.assertIn('SELECT extensions.digest($1,$2)', adapter.NEW_EXTENSION)
        self.assertNotIn('SECURITY DEFINER', adapter.NEW_EXTENSION)
        self.assertNotIn('ALTER EXTENSION', adapter.NEW_EXTENSION)


if __name__ == '__main__':
    unittest.main()
