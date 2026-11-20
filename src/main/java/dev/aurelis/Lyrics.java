package dev.aurelis;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import java.util.zip.InflaterInputStream;
import java.io.*;

/** Java-native adaptation of the seven-provider approach in the supplied lirik.js. */
public final class Lyrics {
    private final Net net=new Net();
    private final ExecutorService workers=Executors.newFixedThreadPool(6,r->{Thread t=new Thread(r,"lyrics-worker");t.setDaemon(true);return t;});
    private final Map<String, Cached> cache=new ConcurrentHashMap<>();
    private record Cached(Object value,long expiry){}
    public static final List<String> SOURCES=List.of("lrclib","netease","qq","kugou","musixmatch","genius","lyricsovh");
    public static List<Object> sources(){
        return List.of(
            src("lrclib","LRCLIB",true,true),src("netease","NetEase",true,true),
            src("qq","QQ Music",true,true),src("kugou","Kugou",true,true),
            src("musixmatch","Musixmatch",true,true),src("genius","Genius",false,false),
            src("lyricsovh","lyrics.ovh",false,false));
    }
    private static Object src(String id,String name,boolean synced,boolean words){return Json.obj("id",id,"name",name,"synced",synced,"wordLevel",words,"availability","best-effort");}
    public Object find(String track,String artist,int duration,String source) {
        if(track.isBlank() || track.length()>180 || artist.length()>180) return Json.obj("result",null,"attempts",List.of());
        String key=track.toLowerCase(Locale.ROOT)+"/"+artist.toLowerCase(Locale.ROOT)+"/"+duration+"/"+source;
        Cached hit=cache.get(key);if(hit!=null&&hit.expiry>System.currentTimeMillis())return hit.value;
        Map<String,Object> results=new ConcurrentHashMap<>();List<Object> attempts=Collections.synchronizedList(new ArrayList<>());
        List<String> ids=source.isBlank()?SOURCES:List.of(source);
        if(!source.isBlank()&&!SOURCES.contains(source))return Json.obj("result",null,"error","unknown_source","attempts",attempts);
        List<CompletableFuture<Void>> tasks=new ArrayList<>();
        for(String id:ids){
            tasks.add(CompletableFuture.runAsync(()->{
                try{Object result=provider(id,track,artist,duration);if(result!=null)results.put(id,result);attempts.add(Json.obj("source",id,"ok",result!=null,"wordLevel",Json.truth(Json.at(result,"wordLevel"))));}
                catch(Exception e){attempts.add(Json.obj("source",id,"ok",false,"note",shortError(e)));}
            },workers));
        }
        try{CompletableFuture.allOf(tasks.toArray(CompletableFuture[]::new)).get(13,TimeUnit.SECONDS);}catch(Exception ignored){tasks.forEach(f->f.cancel(true));}
        Object best=null;int score=-1;
        for(String id:ids){Object r=results.get(id);if(r==null)continue;int s=Json.truth(Json.at(r,"wordLevel"))?3:Json.truth(Json.at(r,"synced"))?2:1;
            if(s>score){best=r;score=s;} }
        Object result=Json.obj("result",best,"attempts",attempts);
        if(cache.size()>250)cache.clear();cache.put(key,new Cached(result,System.currentTimeMillis()+(best==null?60_000:1_800_000)));
        return result;
    }
    public Object all(String track,String artist,int duration){
        // Probe providers concurrently rather than waiting for seven network timeouts in sequence.
        Map<String,CompletableFuture<Object>> pending=new LinkedHashMap<>();
        for(String s:SOURCES) pending.put(s,CompletableFuture.supplyAsync(
            ()->Json.at(find(track,artist,duration,s),"result")));
        Map<String,Object> out=new LinkedHashMap<>();
        for(var entry:pending.entrySet()) {
            try { out.put(entry.getKey(),entry.getValue().get(15,TimeUnit.SECONDS)); }
            catch(Exception e) { entry.getValue().cancel(true); out.put(entry.getKey(),null); }
        }
        return Json.obj("results",out);
    }
    private static String shortError(Exception e){String s=String.valueOf(e.getMessage());return s.length()>110?s.substring(0,110):s;}
    private Object provider(String source,String track,String artist,int duration) throws Exception {
        return switch(source){case "lrclib"->lrclib(track,artist,duration);case "netease"->netease(track,artist,duration);case "qq"->qq(track,artist,duration);
            case "kugou"->kugou(track,artist,duration);case "musixmatch"->musixmatch(track,artist,duration);case "genius"->genius(track,artist,duration);case "lyricsovh"->ovh(track,artist);default->null;};
    }
    private Object lrclib(String title,String artist,int duration) throws Exception {
        String q=title.isBlank()?artist:title+" "+artist;
        String url="https://lrclib.net/api/search?track_name="+Net.enc(title)+(artist.isBlank()?"":"&artist_name="+Net.enc(artist));
        List<Object> candidates=Json.list(Json.parse(net.get(url)));
        Object best=null;double bestScore=0;
        for(Object c:candidates){double s=match(title,artist,duration,Json.get(c,"trackName"),Json.get(c,"artistName"),(int)Json.num(Json.at(c,"duration")));
            if(s>bestScore){best=c;bestScore=s;}}
        if(best==null||bestScore<.52)return null;
        String id=Json.get(best,"id");Object record=Json.parse(net.get("https://lrclib.net/api/get/"+id));
        List<Object> lines=new ArrayList<>();String plain=Json.get(record,"plainLyrics");
        String raw=Json.get(record,"syncedLyrics");
        if(Json.truth(Json.at(record,"hasWordSync")) && !Json.get(record,"lyricsfile").isBlank()) lines=parseLyricsfile(Json.get(record,"lyricsfile"));
        if(lines.isEmpty()&&!raw.isBlank())lines=parseLrc(raw);
        if(lines.isEmpty()&&!plain.isBlank())for(String ln:plain.split("\\R"))lines.add(line(null,null,ln));
        if(lines.isEmpty()&&!Json.truth(Json.at(record,"instrumental")))return null;
        return result("lrclib",Json.get(record,"trackName"),Json.get(record,"artistName"),Json.get(record,"albumName"),Json.num(Json.at(record,"duration")),lines,plain,Json.truth(Json.at(record,"instrumental")));
    }
    private Object netease(String title,String artist,int duration) throws Exception {
        String search=eapi("/api/cloudsearch/pc",Json.obj("s",title+" "+artist,"type",1,"limit",8,"offset",0,"total",true));
        Object best=best(Json.list(Json.at(Json.parse(search),"result","songs")),title,artist,duration,c->Json.get(c,"name"),c->artistList(Json.at(c,"ar")),c->(int)(Json.num(Json.at(c,"dt"))/1000));
        if(best==null)return null;String id=Json.get(best,"id");
        String body=eapi("/api/song/lyric/v1",Json.obj("id",id,"lv",-1,"tv",-1,"rv",-1,"kv",-1,"yv",-1,"fv",-1));
        Object data=Json.parse(body);String yrc=Json.get(data,"yrc","lyric"), lrc=Json.get(data,"lrc","lyric"),translation=Json.get(data,"tlyric","lyric");
        List<Object> lines=!yrc.isBlank()?parseYrc(yrc):parseLrc(lrc);
        if(lines.isEmpty())return null;attachTranslation(lines,translation);
        return result("netease",Json.get(best,"name"),artistList(Json.at(best,"ar")),Json.get(best,"al","name"),Json.num(Json.at(best,"dt"))/1000,lines,"",false);
    }
    private String eapi(String path,Object params) throws Exception {
        Map<String,Object> payload=new LinkedHashMap<>(Json.map(params));
        payload.put("header",Json.obj("os","pc","appver","2.9.7","osver","Microsoft Windows 10 Pro","ct","20","clienttype","0"));
        String data=Json.stringify(payload);String sign=java.util.HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(("nobody"+path+"use"+data+"md5forencrypt").getBytes(StandardCharsets.UTF_8)));
        String message=path+"-36cd479b6b5-"+data+"-36cd479b6b5-"+sign;
        byte[] key="e82ckenh8dichen8".getBytes(StandardCharsets.UTF_8);
        Cipher cipher=Cipher.getInstance("AES/ECB/PKCS5Padding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"));
        String encrypted=java.util.HexFormat.of().withUpperCase().formatHex(cipher.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        String raw=net.post("https://interface.music.163.com/eapi"+path,"params="+Net.enc(encrypted),Map.of("Content-Type","application/x-www-form-urlencoded","Referer","https://music.163.com/","Cookie","os=pc; appver=2.9.7"));
        if(raw.startsWith("{"))return raw;
        try {cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"));return new String(cipher.doFinal(raw.getBytes(StandardCharsets.ISO_8859_1)),StandardCharsets.UTF_8);}catch(Exception e){return "{}";}
    }
    private Object qq(String title,String artist,int duration) throws Exception {
        Object data=Json.parse(net.get("https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w="+Net.enc(title+" "+artist)+"&format=json&cr=1"));
        Object song=best(Json.list(Json.at(data,"data","song","list")),title,artist,duration,c->Json.get(c,"songname"),c->artistList(Json.at(c,"singer")),c->(int)Json.num(Json.at(c,"interval")));
        if(song==null)return null;String mid=Json.get(song,"songmid");
        try {
            Object payload=Json.obj("music.musichallSong.PlayLyricInfo.GetPlayLyricInfo",Json.obj("method","GetPlayLyricInfo","module","music.musichallSong.PlayLyricInfo","param",Json.obj("songMID",mid,"songID",0,"trans",1,"qrc",1,"ct",20,"cv",1932)));
            Object resp=Json.parse(net.post("https://u.y.qq.com/cgi-bin/musicu.fcg",Json.stringify(payload),Map.of("Content-Type","application/json","Referer","https://y.qq.com/")));
            String qrc=Json.get(resp,"music.musichallSong.PlayLyricInfo.GetPlayLyricInfo","data","qrc");
            if(qrc.length()>100){String decrypted=decryptQrc(qrc);List<Object> rich=parseQrc(decrypted);
                if(!rich.isEmpty())return result("qq",Json.get(song,"songname"),artistList(Json.at(song,"singer")),Json.get(song,"albumname"),Json.num(Json.at(song,"interval")),rich,"",false);}
        } catch(Exception ignored) { /* fallback to line-synced LRC */ }
        Object lyric=Json.parse(net.get("https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid="+Net.enc(mid)+"&g_tk=5381&format=json",Map.of("Referer","https://y.qq.com/")));
        String encoded=Json.get(lyric,"lyric");if(encoded.isBlank())return null;
        String raw=new String(Base64.getDecoder().decode(encoded),StandardCharsets.UTF_8);
        List<Object> lines=parseLrc(raw);attachTranslation(lines,decodeBase64(Json.get(lyric,"trans")));
        return result("qq",Json.get(song,"songname"),artistList(Json.at(song,"singer")),Json.get(song,"albumname"),Json.num(Json.at(song,"interval")),lines,"",false);
    }
    private Object kugou(String title,String artist,int duration) throws Exception {
        String q=Net.enc(title+" "+artist), payload="";
        try{payload=net.get("https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword="+q+"&page=1&pagesize=8");}catch(Exception ignored){}
        if(payload.isBlank())return null;
        Object song=best(Json.list(Json.at(Json.parse(payload),"data","info")),title,artist,duration,c->Json.get(c,"songname"),c->Json.get(c,"singername"),c->(int)Json.num(Json.at(c,"duration")));
        if(song==null)return null;
        String hash=Json.get(song,"hash");int seconds=(int)Json.num(Json.at(song,"duration"));
        Object res=Json.parse(net.get("https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword="+Net.enc(title)+"&duration="+seconds+"&hash="+Net.enc(hash)+"&timelength="+(seconds*1000)));
        for(Object candidate:Json.list(Json.at(res,"candidates"))){
            String args="?ver=1&client=pc&id="+Net.enc(Json.get(candidate,"id"))+"&accesskey="+Net.enc(Json.get(candidate,"accesskey"))+"&charset=utf8";
            for(String fmt:List.of("krc","lrc"))try {
                Object dl=Json.parse(net.get("https://lyrics.kugou.com/download"+args+"&fmt="+fmt));String content=Json.get(dl,"content");
                if(content.isBlank())continue;
                String raw=fmt.equals("krc")?decodeKrc(content):decodeBase64(content);
                List<Object> lines=fmt.equals("krc")?parseKrc(raw):parseLrc(raw);
                if(!lines.isEmpty())return result("kugou",Json.get(song,"songname"),Json.get(song,"singername"),Json.get(song,"album_name"),seconds,lines,"",false);
            }catch(Exception ignored){}
        }
        return null;
    }
    private Object musixmatch(String title,String artist,int duration) throws Exception {
        String api="https://apic-desktop.musixmatch.com/ws/1.1",appId="web-desktop-app-v1.0";
        Object token=Json.parse(net.get(api+"/token.get?app_id="+Net.enc(appId)+"&format=json"));
        String tk=Json.get(token,"message","body","user_token");if(tk.isBlank())return null;
        String common="?app_id="+appId+"&format=json&user_token="+Net.enc(tk);
        Object query=Json.parse(net.get(api+"/track.search"+common+"&q_track="+Net.enc(title)+"&q_artist="+Net.enc(artist)+"&page=1&page_size=8"));
        Object hit=best(Json.list(Json.at(query,"message","body","track_list")),title,artist,duration,c->Json.get(c,"track","track_name"),c->Json.get(c,"track","artist_name"),c->(int)Json.num(Json.at(c,"track","track_length")));
        if(hit==null)return null;Object track=Json.at(hit,"track");String trackId=Json.get(track,"track_id");
        Object rich=Json.parse(net.get(api+"/track.richsync.get"+common+"&track_id="+Net.enc(trackId)+"&f_sync_type=json"));
        String body=Json.get(rich,"message","body","richsync","richsync_body");
        List<Object> lines=parseRichsync(body);
        if(lines.isEmpty()){
            Object synced=Json.parse(net.get(api+"/track.subtitle.get"+common+"&track_id="+Net.enc(trackId)+"&subtitle_format=lrc"));
            lines=parseLrc(Json.get(synced,"message","body","subtitle","subtitle_body"));
        }
        if(lines.isEmpty())return null;
        return result("musixmatch",Json.get(track,"track_name"),Json.get(track,"artist_name"),Json.get(track,"album_name"),Json.num(Json.at(track,"track_length")),lines,"",false);
    }
    private Object genius(String title,String artist,int duration) throws Exception {
        // Genius frequently restricts scraping; its best-effort adapter preserves graceful fallback.
        Object result=Json.parse(net.get("https://genius.com/api/search/multi?q="+Net.enc(title+" "+artist),Map.of("Referer","https://genius.com/")));
        for(Object section:Json.list(Json.at(result,"response","sections")))for(Object hit:Json.list(Json.at(section,"hits"))){
            Object song=Json.at(hit,"result");if(!"song".equals(Json.get(hit,"type")))continue;
            if(match(title,artist,duration,Json.get(song,"title"),Json.get(song,"primary_artist","name"),0)<.55)continue;
            String path=Json.get(song,"path");if(!path.startsWith("/")||path.contains(".."))continue;
            String html=net.get("https://genius.com"+path,Map.of("Referer","https://genius.com/"));
            Matcher m=Pattern.compile("(?s)data-lyrics-container=\\\"true\\\"[^>]*>(.*?)</div>").matcher(html);
            StringBuilder lyric=new StringBuilder();while(m.find())lyric.append(m.group(1).replaceAll("(?i)<br\\s*/?>","\n").replaceAll("<[^>]*>","")).append('\n');
            String raw=decodeHtml(lyric.toString()).trim();if(raw.isBlank())return null;
            return result("genius",Json.get(song,"title"),Json.get(song,"primary_artist","name"),"",0,plain(raw),raw,false);
        }
        return null;
    }
    private Object ovh(String title,String artist) throws Exception {
        if(artist.isBlank())return null;
        Object data=Json.parse(net.get("https://api.lyrics.ovh/v1/"+Net.enc(artist)+"/"+Net.enc(title)));
        String lyric=Json.get(data,"lyrics").trim();if(lyric.isBlank())return null;
        return result("lyricsovh",title,artist,"",0,plain(lyric),lyric,false);
    }
    private static String decodeHtml(String x){return x.replace("&amp;","&").replace("&quot;","\"").replace("&#39;","'").replace("&lt;","<").replace("&gt;",">");}
    private static String decodeBase64(String s){try{return new String(Base64.getDecoder().decode(s),StandardCharsets.UTF_8);}catch(Exception e){return "";}}
    private static String artistList(Object artists){List<String> names=new ArrayList<>();for(Object a:Json.list(artists))names.add(Json.get(a,"name"));return String.join(" / ",names);}
    private interface Finder {String get(Object o);}
    private interface Dur {int get(Object o);}
    private static Object best(List<Object> values,String title,String artist,int duration,Finder name,Finder who,Dur dur){
        double score=0.45;Object best=null;
        for(Object c:values){double s=match(title,artist,duration,name.get(c),who.get(c),dur.get(c));if(s>score){score=s;best=c;}}
        return best;
    }
    private static String normalized(String s){return s.toLowerCase(Locale.ROOT).replaceAll("(?i)\\([^)]*(official|lyrics|audio|video)[^)]*\\)","").replaceAll("[^\\p{L}\\p{N}]+"," ").trim();}
    private static double dice(String a,String b){Set<String> a1=new HashSet<>(Arrays.asList(normalized(a).split(" "))),b1=new HashSet<>(Arrays.asList(normalized(b).split(" ")));a1.remove("");b1.remove("");if(a1.isEmpty()||b1.isEmpty())return 0;int n=0;for(String t:a1)if(b1.contains(t))n++;return 2d*n/(a1.size()+b1.size());}
    private static double match(String t,String a,int d,String tc,String ac,int dc){return .58*dice(t,tc)+.32*(a.isBlank()?.7:dice(a,ac))+.10*(d==0||dc==0?.65:Math.max(0,1-Math.abs(d-dc)/9d));}
    private static Map<String,Object> line(Double time,Double end,String text){return Json.obj("time",time,"endTime",end,"text",text.trim());}
    private static List<Object> plain(String raw){List<Object> ls=new ArrayList<>();for(String line:raw.split("\\R"))ls.add(line(null,null,line));return ls;}
    private static Object result(String src,String title,String artist,String album,double duration,List<Object> lines,String plain,boolean instrumental){
        boolean synced=false,word=false;for(Object l:lines){if(Json.at(l,"time")!=null)synced=true;if(!Json.list(Json.at(l,"words")).isEmpty())word=true;}
        return Json.obj("source",src,"track",Json.obj("title",title,"artist",artist,"album",album,"duration",duration),"synced",synced,"wordLevel",word,"instrumental",instrumental,"lines",lines,"plain",plain);
    }
    private static List<Object> parseLrc(String raw){
        List<Object> lines=new ArrayList<>();Pattern pat=Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
        for(String text:raw.split("\\R")){Matcher m=pat.matcher(text);List<Double> times=new ArrayList<>();while(m.find())times.add(sec(m.group(1),m.group(2),m.group(3)));String content=pat.matcher(text).replaceAll("").trim();if(!content.isBlank())for(double time:times){
            Map<String,Object> entry=line(time,null,content.replaceAll("<(\\d+):(\\d+)[.:](\\d+)>",""));
            List<Object> words=parseEnhanced(content);if(!words.isEmpty())entry.put("words",words);
            lines.add(entry);
        }}
        lines.sort(Comparator.comparingDouble(o->Json.num(Json.at(o,"time"))));
        for(int i=0;i<lines.size();i++){
            Map<String,Object> l=Json.map(lines.get(i));double start=Json.num(l.get("time"));double end=i+1<lines.size()?Json.num(Json.at(lines.get(i+1),"time")):start+4;
            l.put("endTime",end);List<Object> words=Json.list(l.get("words"));if(!words.isEmpty())Json.map(words.get(words.size()-1)).put("end",end);
        }
        return lines;
    }
    private static List<Object> parseEnhanced(String body){Matcher m=Pattern.compile("<(\\d+):(\\d+)[.:](\\d+)>").matcher(body);List<Object> words=new ArrayList<>();List<Double> starts=new ArrayList<>();List<Integer> ends=new ArrayList<>();while(m.find()){starts.add(sec(m.group(1),m.group(2),m.group(3)));ends.add(m.end());}
        for(int i=0;i<starts.size();i++){int from=ends.get(i),to=i+1<starts.size()?body.indexOf('<',from):body.length();if(to<from)to=body.length();String w=body.substring(from,to).trim();if(!w.isEmpty())words.add(Json.obj("text",w,"start",starts.get(i),"end",i+1<starts.size()?starts.get(i+1):starts.get(i)+1));}
        return words;
    }
    private static double sec(String mm,String ss,String frac){return Integer.parseInt(mm)*60+Integer.parseInt(ss)+(frac==null?0:Double.parseDouble("0."+frac));}
    private static List<Object> parseLyricsfile(String yaml){
        List<Object> lines=new ArrayList<>();Map<String,Object> current=null,word=null;boolean inside=false;
        for(String raw:yaml.split("\\R")){
            Matcher lm=Pattern.compile("^- text:\\s*(.*)$").matcher(raw);
            if(lm.find()){current=line(null,null,unquote(lm.group(1)));current.put("words",new ArrayList<>());lines.add(current);inside=false;word=null;continue;}
            if(current==null)continue;
            if(raw.startsWith("  words:")){inside=true;continue;}
            Matcher wm=Pattern.compile("^\\s{2,}- text:\\s*(.*)$").matcher(raw);
            if(wm.find()&&inside){word=Json.obj("text",unquote(wm.group(1)));Json.list(current.get("words")).add(word);continue;}
            Matcher field=Pattern.compile("^\\s+([a-z_]+):\\s*(.*)$").matcher(raw);
            if(field.find()){
                double v=Json.num(field.group(2))/1000;
                if(word!=null&&inside&&field.group(1).equals("start_ms"))word.put("start",v);
                else if(!inside&&field.group(1).equals("start_ms"))current.put("time",v);
                else if(!inside&&field.group(1).equals("end_ms"))current.put("endTime",v);
            }
        }
        lines.removeIf(l->Json.at(l,"time")==null);
        for(Object l:lines){List<Object> words=Json.list(Json.at(l,"words"));for(int i=0;i<words.size();i++)Json.map(words.get(i)).put("end",i+1<words.size()?Json.at(words.get(i+1),"start"):Json.at(l,"endTime"));}
        return lines;
    }
    private static String unquote(String s){s=s.trim();return s.length()>1&&((s.startsWith("\"")&&s.endsWith("\""))||(s.startsWith("'")&&s.endsWith("'")))?s.substring(1,s.length()-1):s;}
    private static List<Object> parseYrc(String raw){List<Object> lines=new ArrayList<>();Pattern line=Pattern.compile("^\\[(\\d+),(\\d+)\\](.*)$"),wt=Pattern.compile("\\((\\d+),(\\d+),(\\d+)\\)");
        for(String r:raw.split("\\R")){Matcher l=line.matcher(r);if(!l.find())continue;double start=Double.parseDouble(l.group(1))/1000,end=start+Double.parseDouble(l.group(2))/1000;String content=l.group(3);Matcher m=wt.matcher(content);List<Double> starts=new ArrayList<>(),ends=new ArrayList<>();List<Integer> positions=new ArrayList<>();while(m.find()){starts.add(Double.parseDouble(m.group(1))/1000);ends.add((Double.parseDouble(m.group(1))+Double.parseDouble(m.group(2)))/1000);positions.add(m.end());}
            List<Object> words=new ArrayList<>();for(int i=0;i<positions.size();i++){int from=positions.get(i),to=i+1<positions.size()?content.indexOf('(',from):content.length();if(to<from)to=content.length();String text=content.substring(from,to).trim();if(!text.isBlank())words.add(Json.obj("text",text,"start",starts.get(i),"end",ends.get(i)));}
            Map<String,Object> entry=dev.aurelis.Lyrics.line(start,end,wt.matcher(content).replaceAll("").trim());if(!words.isEmpty())entry.put("words",words);lines.add(entry);
        }return lines;}
    private static String decryptQrc(String hex) throws Exception {
        byte[] data=HexFormat.of().parseHex(hex);
        byte[][] keys={"!@#)(*$%123ZXC!@!@#)(NHL".getBytes(StandardCharsets.US_ASCII),
            {(byte)0x51,(byte)0x88,(byte)0x0a,(byte)0x1d,(byte)0xd2,(byte)0x53,(byte)0xe4,(byte)0x90,(byte)0x40,(byte)0x1c,(byte)0x9a,(byte)0xf3,(byte)0x84,(byte)0x35,(byte)0x18,(byte)0x90,(byte)0xd5,(byte)0x6e,(byte)0x2c,(byte)0x76,(byte)0x54,(byte)0xe2,(byte)0x33,(byte)0x90}};
        for(byte[] key:keys) try {
            Cipher cipher=Cipher.getInstance("DESede/ECB/PKCS5Padding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"DESede"));
            byte[] decoded=cipher.doFinal(data);
            String text=new String(decoded,StandardCharsets.UTF_8);
            if(text.startsWith("["))return text;
            try(InputStream in=new InflaterInputStream(new ByteArrayInputStream(decoded))){text=new String(in.readAllBytes(),StandardCharsets.UTF_8);if(text.startsWith("["))return text;}
        }catch(Exception ignored){}
        try(InputStream in=new InflaterInputStream(new ByteArrayInputStream(data))){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}
    }
    private static List<Object> parseQrc(String raw){
        List<Object> lines=new ArrayList<>();Pattern line=Pattern.compile("^\\[(\\d+),(\\d+)\\](.*)$"),tag=Pattern.compile("<(\\d+),(\\d+)>");
        for(String s:raw.split("\\R")){
            Matcher m=line.matcher(s);if(!m.find())continue;
            double start=Double.parseDouble(m.group(1))/1000,end=start+Double.parseDouble(m.group(2))/1000;
            String content=m.group(3);Matcher w=tag.matcher(content);
            List<Integer> positions=new ArrayList<>();List<Double> starts=new ArrayList<>(),ends=new ArrayList<>();
            while(w.find()){positions.add(w.end());starts.add(Double.parseDouble(w.group(1))/1000);ends.add((Double.parseDouble(w.group(1))+Double.parseDouble(w.group(2)))/1000);}
            List<Object> words=new ArrayList<>();for(int i=0;i<positions.size();i++){
                int from=positions.get(i),to=i+1<positions.size()?content.indexOf('<',from):content.length();if(to<from)to=content.length();
                String text=content.substring(from,to).trim();if(!text.isBlank())words.add(Json.obj("text",text,"start",starts.get(i),"end",ends.get(i)));
            }
            Map<String,Object> entry=line(start,end,tag.matcher(content).replaceAll("").trim());if(!words.isEmpty())entry.put("words",words);lines.add(entry);
        }return lines;
    }
    private static String decodeKrc(String base64) throws Exception{byte[] data=Base64.getDecoder().decode(base64);if(data.length<5)throw new IllegalArgumentException("invalid KRC");int[] key={64,71,97,119,94,50,116,71,81,54,49,45,206,210,110,105};byte[] body=new byte[data.length-4];for(int i=0;i<body.length;i++)body[i]=(byte)(data[i+4]^key[i%16]);try(InputStream in=new InflaterInputStream(new ByteArrayInputStream(body))){return new String(in.readAllBytes(),StandardCharsets.UTF_8);}}
    private static List<Object> parseKrc(String raw){List<Object> lines=new ArrayList<>();Pattern line=Pattern.compile("^\\[(\\d+),(\\d+)\\](.*)$"),wt=Pattern.compile("<(\\d+),(\\d+)(?:,\\d+)?>");
        for(String r:raw.split("\\R")){Matcher l=line.matcher(r);if(!l.find())continue;double start=Double.parseDouble(l.group(1))/1000,end=start+Double.parseDouble(l.group(2))/1000;String content=l.group(3);Matcher m=wt.matcher(content);List<Double> starts=new ArrayList<>(),ends=new ArrayList<>();List<Integer> positions=new ArrayList<>();while(m.find()){starts.add(start+Double.parseDouble(m.group(1))/1000);ends.add(start+(Double.parseDouble(m.group(1))+Double.parseDouble(m.group(2)))/1000);positions.add(m.end());}
            List<Object> words=new ArrayList<>();for(int i=0;i<positions.size();i++){int from=positions.get(i),to=i+1<positions.size()?content.indexOf('<',from):content.length();if(to<from)to=content.length();String text=content.substring(from,to).trim();if(!text.isBlank())words.add(Json.obj("text",text,"start",starts.get(i),"end",ends.get(i)));}
            Map<String,Object> entry=dev.aurelis.Lyrics.line(start,end,wt.matcher(content).replaceAll("").trim());if(!words.isEmpty())entry.put("words",words);lines.add(entry);
        }return lines;}
    private static List<Object> parseRichsync(String body){List<Object> lines=new ArrayList<>();if(body.isBlank())return lines;try{for(Object r:Json.list(Json.parse(body))){double start=Json.num(Json.at(r,"ts")),end=Json.num(Json.at(r,"te"));List<Object> words=new ArrayList<>();StringBuilder text=new StringBuilder();List<Object> items=Json.list(Json.at(r,"x"));for(int i=0;i<items.size();i++){Object w=items.get(i);String word=Json.get(w,"c");double ws=start+Json.num(Json.at(w,"o"));double we=i+1<items.size()?start+Json.num(Json.at(items.get(i+1),"o")):end;words.add(Json.obj("text",word,"start",ws,"end",we));text.append(word);}Map<String,Object> l=line(start,end,text.toString());if(!words.isEmpty())l.put("words",words);lines.add(l);}}catch(Exception ignored){}return lines;}
    private static void attachTranslation(List<Object> lines,String raw){if(raw.isBlank())return;Map<Long,String> ts=new HashMap<>();Pattern p=Pattern.compile("\\[(\\d+):(\\d+)[.:](\\d+)\\](.*)");for(String r:raw.split("\\R")){Matcher m=p.matcher(r);if(m.find())ts.put(Math.round(sec(m.group(1),m.group(2),m.group(3))*100),m.group(4).trim());}for(Object l:lines){String tr=ts.get(Math.round(Json.num(Json.at(l,"time"))*100));if(tr!=null&&!tr.isEmpty())Json.map(l).put("translation",tr);}}
    public static String lrc(Object res,boolean enhanced){StringBuilder b=new StringBuilder();for(Object l:Json.list(Json.at(res,"lines"))){Object t=Json.at(l,"time");if(t==null)continue;b.append('[').append(fmt(Json.num(t))).append(']');List<Object> words=Json.list(Json.at(l,"words"));if(enhanced&&!words.isEmpty())for(Object w:words)b.append('<').append(fmt(Json.num(Json.at(w,"start")))).append('>').append(Json.get(w,"text"));else b.append(Json.get(l,"text"));b.append('\n');}return b.toString();}
    private static String fmt(double x){int centi=(int)Math.round(x*100);return String.format(Locale.US,"%02d:%02d.%02d",centi/6000,(centi/100)%60,centi%100);}
}
