"""Calendar regressions for the newly verified Tokyo museums."""
import unittest
from datetime import date
import prepare_site

class MuseumCalendarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.facilities = {f['facility_id']: f for f in prepare_site.facility_data()}

    def test_monday_holiday_and_next_weekday(self):
        for ident in ['tokyo-fire-museum', 'banknote-postage-museum']:
            f = self.facilities[ident]
            for day, expected in [('2026-10-12', True), ('2026-10-13', False), ('2026-10-14', True), ('2026-10-19', False), ('2026-05-04', True), ('2026-05-05', True), ('2026-05-06', True), ('2026-05-07', False), ('2026-12-29', False), ('2027-01-03', False)]:
                with self.subTest(facility=ident, day=day):
                    self.assertEqual(prepare_site.open_on(f, date.fromisoformat(day)), expected)

    def test_police_museum_closes_next_day_even_during_holidays(self):
        f = self.facilities['police-museum']
        self.assertTrue(prepare_site.open_on(f, date(2026, 5, 4)))
        self.assertFalse(prepare_site.open_on(f, date(2026, 5, 5)))
        self.assertTrue(prepare_site.open_on(f, date(2026, 5, 6)))
        self.assertIn('西五反田', f['address'])
        self.assertFalse(prepare_site.open_on(f, date(2027, 1, 4)))

    def test_fire_museum_commemorative_monday_is_open(self):
        self.assertTrue(prepare_site.open_on(self.facilities['tokyo-fire-museum'], date(2029, 10, 1)))

if __name__ == '__main__':
    unittest.main()
