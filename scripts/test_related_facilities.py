import sys
import unittest
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import prepare_site as site


class ChibaFacilityTests(unittest.TestCase):
    def test_chiba_history_museum_holiday_shift_and_year_end(self):
        f = next(x for x in site.facility_data() if x['facility_id'] == 'chiba-city-folk-museum')
        self.assertTrue(site.open_on(f, date(2026, 10, 12)))
        self.assertFalse(site.open_on(f, date(2026, 10, 13)))
        self.assertTrue(site.open_on(f, date(2026, 10, 17)))
        self.assertFalse(site.open_on(f, date(2026, 12, 29)))
        self.assertTrue(site.open_on(f, date(2027, 1, 5)))

    def test_related_card_preserves_conditions_and_escapes_text(self):
        rows = site.facility_data()
        f = next(x for x in rows if x['facility_id'] == 'chiba-city-folk-museum')
        candidate = dict(f, facility_id='condition-test', name='<unsafe>', free_conditions='子どものみ無料')
        markup = site.facility_page_html(f, 'https://example.com/', date(2026, 10, 17), None, None, related_facilities=[candidate])
        section = markup.split('<h2>同じエリアの施設も見る</h2>', 1)[1].split('<h2>関連ページ</h2>', 1)[0]
        self.assertIn('子どものみ無料', section)
        self.assertIn('&lt;unsafe&gt;', section)
        self.assertIn('無料になる日・対象者は施設ごとに異なります', section)


if __name__ == '__main__':
    unittest.main()
