import unittest
from urllib.parse import urlsplit, parse_qs
from prepare_site import calendar_link

class CalendarContextTests(unittest.TestCase):
    def test_context_preserved(self):
        for path, expected in [
            ('chiba/free', {'view':['calendar'], 'prefecture':['千葉県']}),
            ('tokyo/art-museum/free', {'view':['calendar'], 'prefecture':['東京都'], 'category':['美術館']}),
            ('free/factory-tour', {'view':['calendar'], 'category':['工場見学']}),
            ('free/this-weekend', {'view':['calendar']}),
        ]:
            with self.subTest(path=path):
                u=urlsplit(calendar_link('https://example.com/sub/',path))
                self.assertEqual(u.path, '/sub/')
                self.assertEqual(parse_qs(u.query), expected)

if __name__=='__main__': unittest.main()
