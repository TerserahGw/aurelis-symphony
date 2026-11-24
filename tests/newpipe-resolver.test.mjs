import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNewpipeOutput} from '../server/newpipe-resolver.mjs';
test('newpipe outputs only validated media URLs, and access denials are preserved',()=>{
  assert.equal(parseNewpipeOutput('{"ok":true,"url":"https://r1.googlevideo.com/videoplayback"}'),'https://r1.googlevideo.com/videoplayback');
  for(const url of ['https://googlevideo.com.evil.test/a','http://googlevideo.com/a','https://a:b@googlevideo.com/a','https://googlevideo.com:123/a']){
    assert.throws(()=>parseNewpipeOutput(JSON.stringify({ok:true,url})),{code:'newpipe_invalid_host'});
  }
  assert.throws(()=>parseNewpipeOutput('{"ok":false,"code":"youtube_access_required"}'),{code:'youtube_access_required'});
  assert.throws(()=>parseNewpipeOutput('bad'),{code:'newpipe_invalid_response'});
});
