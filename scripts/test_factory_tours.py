import unittest
from datetime import date
import tempfile
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
from io import StringIO
import prepare_site as site

class FactoryTourTests(unittest.TestCase):
    def test_reserved_factories_do_not_assert_date_availability(self):
        factories = [f for f in site.facility_data() if f['category'] == '工場見学' and f.get('reservation_required')]
        self.assertGreaterEqual(len(factories), 4)
        for f in factories:
            self.assertTrue(site.approved(f))
            unknown = dict(f, audit={'status':'unverified'})
            self.assertIsNone(site.listing_occurrence(unknown, date(2026, 10, 24)))
            self.assertNotIn(unknown, site.eligible_facilities([unknown]))
            self.assertTrue(f['reservation_required'])
            self.assertTrue(f['visit_info']['reservation'])
            self.assertIsNone(site.next_occurrence(f, date(2026, 10, 24)))
            self.assertFalse(site.has_always(f))
            self.assertEqual(site.free_events(f, date(2026, 10, 24)), [])

    def test_factory_and_saitama_guides_are_discoverable_without_false_open_dates(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            with patch('sys.argv', ['prepare_site.py','--site-url','https://example.com/','--output',directory,'--today','2026-10-21']), redirect_stdout(StringIO()):
                site.main()
            factory = (out/'free/factory-tour/index.html').read_text()
            self.assertIn('グリコピア・イースト', factory)
            self.assertIn('抽選', factory)
            self.assertIn('有料体験', factory)
            self.assertIn('要予約・開催日未確定', factory)
            self.assertNotIn('noindex', factory)
            saitama = (out/'saitama/free/index.html').read_text()
            self.assertIn('赤城乳業', saitama)
            self.assertIn('ガトーフェスタ', (out/'gunma/free/index.html').read_text())
            self.assertIn('めんたいパーク大洗', (out/'ibaraki/free/index.html').read_text())
            self.assertIn('グリコピア', saitama)
            self.assertIn('https://example.com/free/factory-tour/', (out/'sitemap.xml').read_text())
            self.assertIn('https://example.com/saitama/free/', (out/'index.html').read_text())
            for f in site.facility_data():
                if not f.get('reservation_required'):
                    continue
                marker = 'facility/' + f['facility_id'] + '/'
                for path in ['free/today/index.html','free/this-weekend/index.html','free/always/index.html']:
                    self.assertNotIn(marker, (out/path).read_text())
                detail = (out/marker/'index.html').read_text()
                self.assertIn('無料・要予約', detail)
                self.assertIn('https://example.com/free/factory-tour/', detail)
                self.assertIn('BreadcrumbList', detail)

    def test_walk_in_factory_open_days_and_reserved_age_conditions(self):
        rows = {f['facility_id']: f for f in site.facility_data()}
        harada = rows['harada-head-office-factory']
        self.assertTrue(site.free_events(harada, date(2026,10,24)))
        self.assertEqual(site.free_events(harada, date(2026,10,25)), [])
        self.assertEqual(site.free_events(harada, date(2027,1,1)), [])
        self.assertTrue(site.free_events(rows['mentai-park-oarai'], date(2026,10,25)))
        meiji = rows['meiji-moriya-factory']
        self.assertEqual(meiji['free_rules'][0]['eligibility']['min_age'], 4)
        self.assertIn('4歳未満', meiji['free_conditions'])
