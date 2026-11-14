import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('browser_boundary',Path(__file__).with_name('browser.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BrowserGuards(unittest.TestCase):
 def test_exact_routes(self):
  origin='http://127.0.0.1:12345';api='http://127.0.0.1:55541';key='owner/attempt';files={'/','/fixture.js'}
  for path,method in [('/auth/v1/token?grant_type=password','POST'),('/auth/v1/user','GET'),('/rest/v1/rpc/fixture_canonical_descriptor','POST'),('/storage/v1/object/feedback-images-canonical/'+key,'GET')]:
   self.assertTrue(m.allowed(api+path,method,origin,files,api,key));self.assertTrue(m.allowed(api+path,'OPTIONS',origin,files,api,key));self.assertFalse(m.allowed(api+path,'DELETE',origin,files,api,key))
  for url in [api+'/storage/v1/object/feedback-images-canonical/other',api+'/auth/v1/token?grant_type=refresh_token',api+'/auth/v1/user?x=1',api+'/auth/v1/user#x','https://external.invalid/', 'http://user@127.0.0.1:55541/auth/v1/user']:
   self.assertFalse(m.allowed(url,'GET',origin,files,api,key))
  self.assertTrue(m.allowed(origin+'/fixture.js','GET',origin,files,api,key));self.assertFalse(m.allowed(origin+'/fixture.js','POST',origin,files,api,key))
 def test_denial_not_generic_failure(self):
  self.assertTrue(m.denied(403,{'code':'AccessDenied'}));self.assertTrue(m.denied(400,{'error':'not_found','statusCode':'404','message':'Object not found'}))
  for status,body in [(500,{'code':'AccessDenied'}),(403,{'code':'unknown'}),(200,{'code':'AccessDenied'}),(403,None)]:self.assertFalse(m.denied(status,body))
if __name__=='__main__':unittest.main()
