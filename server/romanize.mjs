/* Aurelis 2.7 — script-aware romanization.
 * Japanese Kanji: lazy Kuromoji dictionary + WanaKana Hepburn kana reading;
 * Korean: Revised Romanization; Chinese: contextual Hanyu Pinyin with tones.
 * Never silently treat unknown Japanese Kanji as Chinese pronunciation.
 * Dictionaries initialize only if requested; cache capped for small hosts. */
import { createRequire } from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const MAX_ITEMS=60,MAX_LINE=320,CACHE_SIZE=130;
const cache=new Map();
let japaneseTokenizerPromise=null;
const script={
  ko:/[\uac00-\ud7af]/u,
  kana:/[\u3040-\u30ff\uff66-\uff9d]/u,
  han:/[\u3400-\u9fff\uf900-\ufaff]/u,
  unknownHan:/[\u3400-\u9fff\uf900-\ufaff]/u
};
function japaneseTokenize(){
  if(!japaneseTokenizerPromise){
    japaneseTokenizerPromise=new Promise((resolve,reject)=>{
      try{
        const kuromoji=require('kuromoji');
        const dict=path.join(path.dirname(require.resolve('kuromoji/package.json')),'dict');
        kuromoji.builder({dicPath:dict}).build((err,tokenizer)=>{
          if(err)reject(err);else resolve(tokenizer);
        });
      }catch(error){reject(error);}
    }).catch(err=>{japaneseTokenizerPromise=null;throw err;});
  }
  return japaneseTokenizerPromise;
}
function detectLanguage(lines,hint='auto'){
  if(['ja','ko','zh'].includes(hint))return hint;
  const whole=lines.join(' ');
  const ko=(whole.match(/[\uac00-\ud7af]/gu)||[]).length;
  const kana=(whole.match(/[\u3040-\u30ff]/gu)||[]).length;
  const han=(whole.match(/[\u3400-\u9fff]/gu)||[]).length;
  if(ko>=kana && ko>=han && ko>0)return 'ko';
  if(kana>0)return 'ja';
  if(han>0)return 'zh';
  return 'none';
}
function isPunctuation(s){
  return !/[\p{L}\p{N}]/u.test(s);
}
async function japanese(line){
  const tokenizer=await japaneseTokenize();
  const {toRomaji}=await import('wanakana');
  const tokens=tokenizer.tokenize(line);
  const parts=[];
  let complete=true;
  for(const tok of tokens){
    const surface=tok.surface_form||'';
    if(!surface)continue;
    let kana=tok.reading&&tok.reading!=='*'?tok.reading:surface;
    if(tok.pos==='助詞'){
      if(surface==='は')kana='ワ';
      if(surface==='へ')kana='エ';
      if(surface==='を')kana='オ';
    }
    if(script.unknownHan.test(kana)){complete=false;parts.push(surface);continue;}
    const result=toRomaji(kana,{upcaseKatakana:false});
    if(isPunctuation(result) && parts.length){parts[parts.length-1]+=result;continue;}
    if(result.trim())parts.push(result);
  }
  return {text:parts.join(' ').replace(/\s+([、。，．,.!?！？])/gu,'$1').trim(),
    complete,engine:'kuromoji-wanakana'};
}
async function korean(line){
  const {romanize}=await import('@romanize/korean');
  return {text:romanize(line),complete:true,engine:'revised-romanization'};
}
async function chinese(line){
  const {pinyin}=await import('pinyin-pro');
  return {text:pinyin(line,{toneType:'symbol',nonZh:'consecutive'}),complete:true,engine:'pinyin-pro'};
}
async function convert(line,language){
  if(!line.trim())return {text:'',complete:true,engine:'none'};
  if(language==='ko')return korean(line);
  if(language==='ja')return japanese(line);
  if(language==='zh')return chinese(line);
  return {text:line,complete:true,engine:'none'};
}
export async function romanizeBatch(input={}){
  const texts=input.texts;
  if(!Array.isArray(texts)||texts.length<1||texts.length>MAX_ITEMS||
     texts.some(t=>typeof t!=='string'||t.length>MAX_LINE))
    return {ok:false,error:'invalid_texts',message:'texts harus berupa 1–60 string (maksimal 320 karakter per baris).'};
  const language=detectLanguage(texts,String(input.language||'auto'));
  const key=JSON.stringify([language,texts]);
  const hit=cache.get(key);
  if(hit)return hit;
  const lines=[];
  for(const line of texts){
    try{
      lines.push(await convert(line,language));
    }catch(e){
      // Explicitly report degraded results; do NOT misromanize Japanese
      // Kanji with unrelated Chinese readings on tokenizer failures.
      lines.push({text:line,complete:false,engine:'unavailable'});
    }
  }
  const result={ok:true,language,lines,complete:lines.every(x=>x.complete),
    notice:language==='ja'?'Japanese readings use a dictionary; lyric-specific names, kanji and song pronunciations can differ.':
      language==='ko'?'Revised Romanization approximates standard pronunciation, not all lyric phrasing.':
      language==='zh'?'Mandarin Pinyin; polyphonic characters may have multiple context-dependent readings.':
      'No supported CJK script detected.'};
  if(cache.size>=CACHE_SIZE)cache.delete(cache.keys().next().value);
  cache.set(key,result);
  return result;
}
