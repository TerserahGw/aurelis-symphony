// Optional private audio authentication. Never return or log account credentials.
import {createHash,timingSafeEqual} from 'node:crypto';
const enabled=process.env.AURELIS_YOUTUBE_COOKIE_ENABLED==='true';
const cookie=String(process.env.AURELIS_YOUTUBE_COOKIE||'').trim();
const password=String(process.env.AURELIS_AUDIO_PASSWORD||'');
export function validateCookieHeader(value){
  return typeof value==='string'&&value.length>0&&value.length<=24000&&
    !/[\x00-\x1f\x7f]/.test(value)&&value.split(';').every(p=>/^\s*[^=;\s]+=[^;]*$/.test(p));
}
const configured=enabled&&validateCookieHeader(cookie)&&password.length>=24;
export function authStatus(){return {enabled,configured,privateAudio:enabled};}
export function youtubeCookie(){return configured?cookie:undefined;}
export function matchesAudioAuth(header,secret){
  if(typeof header!=='string'||header.length>4096||typeof secret!=='string'||secret.length<24)return false;
  const m=/^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if(!m)return false;
  const actual=Buffer.from(m[1],'base64').toString('utf8');
  const hash=value=>createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(actual),hash('aurelis:'+secret));
}
export function audioAuthGate(req,res,pathname){
  if(!enabled)return false;
  // Metadata endpoints stay public; protect the browser entry point and all audio relays.
  if(!(/^\/api\/v2\/audio(?:\/|$)/.test(pathname)||pathname==='/'||/^\/index(?:-[\w-]+)?\.html$/.test(pathname)||/^\/docs\/api(?:\.html|\/)?$/.test(pathname)))return false;
  if(configured&&matchesAudioAuth(req.headers.authorization,password))return false;
  const status=configured?401:503;
  const body={ok:false,code:configured?'audio_auth_required':'audio_auth_not_configured'};
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(configured?{'WWW-Authenticate':'Basic realm="Aurelis Private Audio", charset="UTF-8"'}:{})});
  res.end(req.method==='HEAD'?undefined:JSON.stringify(body));
  return true;
}
