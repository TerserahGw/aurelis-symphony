// Safe HTTP download filenames; never allow user-controlled header injection.
export function safeFilename(title, fallback='aurelis-audio') {
  const cleaned=String(title||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 _.-]/g,' ')
    .replace(/[.]{2,}/g,'.').replace(/\s+/g,' ').trim().slice(0,90).replace(/[. ]+$/,'');
  return cleaned||fallback;
}
export function contentDisposition(title,id,mime='audio/mp4') {
  const extension=/webm/.test(mime)?'webm':/mpeg|mp3/.test(mime)?'mp3':'m4a';
  const safe=safeFilename(title,'Aurelis-'+String(id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,20));
  return 'attachment; filename="'+safe+'.'+extension+'"';
}
