"""Integrity of manual evidence only; assertions do not prove its interpretation."""
import hashlib,json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
class SemanticEvidence(unittest.TestCase):
    def test_all_pinned_candidates_have_manual_dispositions(self):
        raw=(HERE/'manifest.json').read_bytes();manifest=json.loads(raw)
        review=json.loads((HERE/'semantic-review.json').read_text())
        self.assertEqual(review['manifest_sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual({r['signature'] for r in review['rows']},{r['signature'] for r in manifest['function_candidates']})
        self.assertEqual(len(review['rows']),29)
        for row in review['rows']:
            self.assertTrue(row['direct_write_semantics'])
            self.assertTrue(row['proposed_disposition_and_reason'])
    def test_exact_statement_file_hashes_and_line_ranges(self):
        review=json.loads((HERE/'semantic-review.json').read_text())
        entries=[r['source'] for r in review['rows']]+review['reviewed_helpers']
        for e in entries:
            raw=(ROOT/e['path']).read_bytes();part=raw[e['start_byte']:e['start_byte']+e['byte_length']]
            self.assertEqual(hashlib.sha256(raw).hexdigest(),e['file_sha256'])
            self.assertEqual(hashlib.sha256(part).hexdigest(),e['sha256'])
            self.assertEqual(raw[:e['start_byte']].count(b'\n')+1,e['start_line'])
            self.assertEqual(raw[:e['start_byte']+e['byte_length']].count(b'\n')+1,e['end_line'])
if __name__=='__main__':unittest.main()
