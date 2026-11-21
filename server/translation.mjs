// On-demand subtitle translation for Aurelis lyric UI.
// Uses MyMemory's documented /get endpoint. Lyrics are sent to that service
// only after user explicitly enables translation; anonymous usage is limited.
const cache = new Map();
export function detectLyricLanguage(text) {
  const value = String(text || '');
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u3400-\u9fff]/u.test(value)) return 'zh-CN';
  return 'en';
}
async function translate(text, lang, target) {
  if (!text.trim()) return '';
  if (lang === target) return text;
  const key = lang+'|'+target+'|'+text.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.until>Date.now()) return hit.value;
  if (Buffer.byteLength(text)>450) return '';
  const q = new URLSearchParams({ q:text, langpair:lang+'|'+target });
  const res = await fetch('https://api.mymemory.translated.net/get?'+q, {
    signal:AbortSignal.timeout(7_000),
    headers:{ Accept:'application/json', 'User-Agent':'AurelisSymphony/2.2' }
  });
  if (!res.ok) throw new Error('translation_http_'+res.status);
  const data = await res.json();
  if (Number(data.responseStatus || 200) >= 400 || data.quotaFinished) {
    throw new Error('translation_quota');
  }
  const translated = String(data.responseData?.translatedText || '').trim();
  if (!translated || /^MYMEMORY WARNING/i.test(translated)) throw new Error('translation_not_found');
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  cache.set(key,{value:translated,until:Date.now()+12*60*60*1000});
  return translated;
}
export async function translateLyrics(payload) {
  const texts = payload?.texts;
  if (!Array.isArray(texts) || texts.length<1 || texts.length>16
      || !texts.every(t=>typeof t==='string' && t.length<=250)) {
    return {ok:false,code:'invalid_texts',message:'Kirim 1-16 baris lirik (maks 250 karakter per baris).'};
  }
  const target = payload.target || 'id';
  if (!['id','en'].includes(target)) {
    return {ok:false,code:'invalid_target',message:'Bahasa tujuan tidak didukung.'};
  }
  const results = new Array(texts.length).fill('');
  let failures = 0;
  let cursor = 0;
  // Concurrency two: avoid hammering a free service and spiking Altare CPU.
  async function worker() {
    while (cursor<texts.length) {
      const i = cursor++;
      const lang = detectLyricLanguage(texts[i]);
      try { results[i] = await translate(texts[i],lang,target); }
      catch { failures++; }
    }
  }
  await Promise.all([worker(),worker()]);
  return {ok:failures<texts.length,provider:'MyMemory',target,translations:results,
    translated:results.filter(Boolean).length, failures,
    notice:failures ? 'Sebagian baris gagal diterjemahkan karena batas layanan gratis.' : null};
}
