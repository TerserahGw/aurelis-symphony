// NewPipe optional resolver: exact public/authorized ID, no credentials or arbitrary URL input.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export const newpipeEnabled=process.env.AURELIS_NEWPIPE_FALLBACK==='true';
let running=false;
function fail(code){return Object.assign(Error('NewPipe audio resolution failed: '+code),{code});}
export function parseNewpipeOutput(stdout){
  let value;
  try{value=JSON.parse(stdout.trim());}catch{throw fail('newpipe_invalid_response');}
  if(!value?.ok)throw fail(['youtube_access_required','newpipe_no_audio','newpipe_unavailable'].includes(value?.code)?value.code:'newpipe_unavailable');
  let url;try{url=new URL(value.url);}catch{throw fail('newpipe_invalid_response');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='googlevideo.com'||url.hostname.endsWith('.googlevideo.com')))throw fail('newpipe_invalid_host');
  return url.href;
}
export async function resolveNewpipe(id){
  if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw fail('invalid_id');
  if(running)throw fail('newpipe_busy');
  running=true;
  try{
    let stdout;
    try{
      ({stdout}=await run('java',['-Xmx192m','-XX:ActiveProcessorCount=1','-cp','/opt/aurelis-newpipe/lib/*','dev.aurelis.NewPipeAudioCli',id],{
        timeout:25000,maxBuffer:128*1024,killSignal:'SIGKILL',env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:'/tmp',LANG:'C.UTF-8'}}));
    }catch{throw fail('newpipe_process_failed');}
    return parseNewpipeOutput(stdout);
  }finally{running=false;}
}
