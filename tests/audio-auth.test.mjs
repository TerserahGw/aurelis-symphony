import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCookieHeader,matchesAudioAuth} from '../server/audio-auth.mjs';
import {isAccessChallenge} from '../server/ytdlp-resolver.mjs';
test('single-line cookie configuration rejects header injection and Netscape files',()=>{
  assert.equal(validateCookieHeader('TEST=example; OTHER=abc'),true);
  assert.equal(validateCookieHeader('TEST=a\nOTHER=b'),false);
  assert.equal(validateCookieHeader('# Netscape HTTP Cookie File'),false);
});
test('private audio access requires the distinct administrator password',()=>{
  const secret='test-password-long-enough-123';
  const basic=s=>'Basic '+Buffer.from(s).toString('base64');
  assert.equal(matchesAudioAuth(basic('aurelis:'+secret),secret),true);
  assert.equal(matchesAudioAuth(basic('wrong:'+secret),secret),false);
  assert.equal(matchesAudioAuth('Bearer '+secret,secret),false);
  assert.equal(matchesAudioAuth(basic('aurelis:short'),'short'),false);
});
test('explicit access challenges are not ordinary format failures',()=>{
  assert.equal(isAccessChallenge(Error('Sign in to confirm you’re not a bot')),true);
  assert.equal(isAccessChallenge(Error('LOGIN_REQUIRED')),true);
  assert.equal(isAccessChallenge(Error('No audio format')),false);
});
