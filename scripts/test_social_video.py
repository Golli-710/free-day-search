import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('social_render',Path(__file__).parent/'social/render.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
class SocialVideoTest(unittest.TestCase):
    def sample(self):
        data={key:'確認済み情報' for key in ['brand','facility_name','region','date_label','free_condition','free_scope','audience','hours','closed','reservation','access','verified_at','cta']}
        data.update(type='free_outing',duration=15,source_url='https://official.example/',url='https://free-day-search.pages.dev/');return data
    def test_outing_scenes_preserve_conditions_and_total_fifteen_seconds(self):
        data=self.sample();data['free_condition']='常設展のみ無料・企画展は有料';data['audience']='大人・一般'
        renderer.validate(data);plan=renderer.scenes(data)
        self.assertEqual(sum(p['seconds'] for p in plan),15)
        self.assertIn(data['free_condition'],' '.join(plan[1]['lines']))
        self.assertIn(data['audience'],' '.join(plan[1]['lines']))
        self.assertNotIn('ご予約',' '.join(p['title'] for p in plan))
    def test_missing_source_and_wrong_engine_type_cannot_render(self):
        for key,value in [('source_url',''),('type','salon'),('duration',30),('free_condition','')]:
            data=self.sample();data[key]=value
            with self.assertRaises(ValueError):renderer.validate(data)
