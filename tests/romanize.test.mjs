import test from 'node:test';
import assert from 'node:assert/strict';
import {romanizeBatch} from '../server/romanize.mjs';

test('romanization input is bounded and language detection is explicit',async()=>{
  assert.equal((await romanizeBatch({texts:[]})).error,'invalid_texts');
  assert.equal((await romanizeBatch({texts:['a'.repeat(321)]})).error,'invalid_texts');
  const nothing=await romanizeBatch({texts:['Hello world'],language:'auto'});
  assert.equal(nothing.language,'none');
  assert.equal(nothing.lines[0].text,'Hello world');
});
test('Korean Revised Romanization handles words as units',async()=>{
  const r=await romanizeBatch({texts:['안녕하세요','사랑해요'],language:'ko'});
  assert.equal(r.ok,true);
  assert.equal(r.language,'ko');
  assert.match(r.lines[0].text,/annyeong/i);
  assert.match(r.lines[1].text,/sarang/i);
  assert.ok(r.lines.every(x=>x.complete));
});
test('Mandarin pinyin includes real tones rather than generic Latin substitutions',async()=>{
  const r=await romanizeBatch({texts:['你好世界'],language:'zh'});
  assert.equal(r.ok,true);
  assert.match(r.lines[0].text,/nǐ/);
  assert.match(r.lines[0].text,/hǎo/);
});
test('Japanese dictionary reads Kanji, Kana, and grammatical particles', {timeout:30000},async()=>{
  const r=await romanizeBatch({texts:['音楽が好きです','今日はいい天気'],language:'ja'});
  assert.equal(r.ok,true);
  assert.equal(r.language,'ja');
  assert.match(r.lines[0].text,/ongaku/i);
  assert.match(r.lines[0].text,/suki/i);
  assert.ok(!/音楽/.test(r.lines[0].text),'known Kanji should be converted with the dictionary');
  assert.match(r.lines[1].text,/wa/i);
});
