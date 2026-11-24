// Optional third resolver for ordinary accessible media; no account secrets passed.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export const ytdlpEnabled=process.env.AURELIS_YTDLP_FALLBACK==='true';
let running=false;
export function isAccessChallenge(error){
  return /confirm you.?re not a bot|sign.?in.*(?:bot|confirm)|LOGIN_REQUIRED|SignInConfirmNotBot|captcha|age.restrict|private video|members.only/i.test(String(error?.message||error||''));
}
export async function resolveYtdlp(id){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw Object.assign(Error('Invalid video ID'),{code:'invalid_id'});
  if(running)throw Object.assign(Error('Resolver busy'),{code:'ytdlp_busy'});
  running=true;
  try{
    const {stdout}=await run('yt-dlp',['--ignore-config','--no-cache-dir','--no-playlist','--skip-download','--no-warnings','--socket-timeout','8','--retries','0','--extractor-retries','0','--js-runtimes','node','-f','bestaudio[ext=m4a]/bestaudio','--get-url','--','https://www.youtube.com/watch?v='+id],
      {timeout:16000,maxBuffer:64*1024,killSignal:'SIGKILL',env:{PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8',NODE_OPTIONS:'--max-old-space-size=96'}});
    const lines=stdout.trim().split(/\r?\n/);
    if(lines.length!==1)throw Error('Unexpected format');
    const url=new URL(lines[0]);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='googlevideo.com'||url.hostname.endsWith('.googlevideo.com')))throw Error('Unexpected media host');
    return url.href;
  }catch(e){
    // execFile errors contain argv/stdout/stderr; never propagate them or signed URLs.
    const challenged=isAccessChallenge(e.stderr||e.message);
    throw Object.assign(Error(challenged?'YouTube requires verification or restricted access.':'yt-dlp could not resolve accessible audio.'),{code:challenged?'youtube_access_required':'ytdlp_unavailable'});
  }finally{running=false;}
}
