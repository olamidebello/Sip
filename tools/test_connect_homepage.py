from pathlib import Path
import unittest
from html.parser import HTMLParser
from prepare_connect_homepage import patch,OLD,NEW
ROOT=Path(__file__).resolve().parents[1]
class Collector(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.videos=[];self.tracks=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='a':self.links.append(a)
  if tag=='video':self.videos.append(a)
  if tag=='track':self.tracks.append(a)
class HomeTests(unittest.TestCase):
 def test_only_known_alias_is_replaced(self):
  original='{$DOMAIN} { handle /api/* { reverse_proxy api:8080 } }\n'+OLD
  result=patch(original);self.assertTrue(result.startswith(original.split(OLD)[0]));self.assertIn('redir https://sip.dobhrap.com{uri} 302',result);self.assertIn('@marketing path / /welcome /welcome/ /welcome/*',result);self.assertEqual(patch(result),result)
 def test_unknown_alias_is_not_overwritten(self):
  with self.assertRaises(ValueError):patch('olamideconnect.com { file_server }')
 def test_account_links_and_accessible_video(self):
  html=(ROOT/'apps/web/public/welcome/index.html').read_text();p=Collector();p.feed(html)
  self.assertTrue(any(x.get('href')=='https://sip.dobhrap.com/pages/login' for x in p.links));self.assertTrue(any(x.get('href')=='https://sip.dobhrap.com/pages/signup' for x in p.links));self.assertEqual(len(p.videos),1);self.assertIn('controls',p.videos[0]);self.assertNotIn('autoplay',p.videos[0]);self.assertTrue(any(t.get('kind')=='captions' for t in p.tracks));self.assertIn('Illustrated',html)
 def test_video_and_local_assets_exist(self):
  folder=ROOT/'apps/web/public/welcome';self.assertGreater((folder/'olamideconnect-demo.mp4').stat().st_size,1000)
  for name in ['home.css','home.js','mark.svg','demo-poster.svg','demo-en.vtt']:self.assertTrue((folder/name).is_file())
if __name__=='__main__':unittest.main()
