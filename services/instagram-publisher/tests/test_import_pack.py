import importlib.util, json, tempfile, unittest
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('import_pack',Path(__file__).parents[1]/'scripts/import_pack.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ImportTests(unittest.TestCase):
 def fixture(self,root):
  kit=root/'kit';(kit/'東京_週末').mkdir(parents=True)
  for name in ('01.png','02.png'):Image.new('RGB',(1080,1350),'white').save(kit/'東京_週末'/name)
  manifest=kit/'manifest.json';manifest.write_text(json.dumps({'posts':[{'id':'東京_週末','channel':'instagram','assets':['01.png','02.png'],'text':'東京の週末候補','scheduled_at':'2026-11-12T19:00:00+09:00'}]}));return manifest
 def test_import_keeps_draft_and_rejects_duplicate(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m=self.fixture(root);out=root/'service'
   self.assertEqual(module.import_pack(m,out),1)
   p=json.loads((out/'queue.json').read_text())['posts'][0]
   self.assertFalse(p['approved']);self.assertIsNone(p['approval_reference'])
   self.assertEqual(p['caption'],'東京の週末候補')
   self.assertTrue((out/('public'+p['media_paths'][0])).read_bytes().startswith(b'\xff\xd8'))
   with self.assertRaises(ValueError):module.import_pack(m,out)
 def test_path_escape_not_imported(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m=self.fixture(root);d=json.loads(m.read_text());d['posts'][0]['assets'][0]='../private.png';m.write_text(json.dumps(d))
   with self.assertRaises(ValueError):module.import_pack(m,root/'service')
   self.assertFalse((root/'service/queue.json').exists())
 def test_wrong_ratio_not_imported(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);m=self.fixture(root);Image.new('RGB',(300,100)).save(m.parent/'東京_週末/01.png')
   with self.assertRaises(ValueError):module.import_pack(m,root/'service')
if __name__=='__main__':unittest.main()
