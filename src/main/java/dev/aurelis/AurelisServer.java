package dev.aurelis;

import com.sun.net.httpserver.*;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Zero-framework HTTP server: the compiled distribution runs on Java 17 without Node. */
public final class AurelisServer {
    private final Lyrics lyrics=new Lyrics();
    private final List<Object> catalog;
    private final Path dataDir=Path.of(System.getenv().getOrDefault("AURELIS_DATA_DIR","data"));
    private final boolean cloudLibrary="true".equalsIgnoreCase(System.getenv().getOrDefault("AURELIS_CLOUD_LIBRARY","false"));
    private final String cors=System.getenv().getOrDefault("AURELIS_CORS_ORIGIN","");
    private final Map<String,Window> limits=new ConcurrentHashMap<>();
    private record Window(long started,int count) {}
    private final Object libraryLock=new Object();
    @SuppressWarnings("unchecked")
    private AurelisServer() throws Exception{
        try(InputStream in=getClass().getResourceAsStream("/web/catalog.json")){
            if(in==null)throw new IllegalStateException("catalog.json missing");
            catalog=Json.list(Json.parse(new String(in.readAllBytes(),StandardCharsets.UTF_8)));
        }
        Files.createDirectories(dataDir);
    }
    public static void main(String[] args) throws Exception{
        String host=System.getenv().getOrDefault("HOST","0.0.0.0");
        int port=Integer.parseInt(System.getenv().getOrDefault("PORT","8080"));
        AurelisServer app=new AurelisServer();
        HttpServer server=HttpServer.create(new InetSocketAddress(host,port),128);
        server.createContext("/",app::handle);
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4,Math.min(16,Runtime.getRuntime().availableProcessors()*2))));
        server.start();
        System.out.println("Aurelis Symphony listening at http://"+host+":"+port);
        Runtime.getRuntime().addShutdownHook(new Thread(()->server.stop(1)));
    }
    private static Map<String,String> query(String raw){Map<String,String> out=new LinkedHashMap<>();if(raw==null)return out;
        for(String chunk:raw.split("&")){if(chunk.isBlank())continue;String[] a=chunk.split("=",2);try{out.put(URLDecoder.decode(a[0],StandardCharsets.UTF_8),URLDecoder.decode(a.length>1?a[1]:"",StandardCharsets.UTF_8));}catch(Exception ignored){}}
        return out;
    }
    private static int boundedInt(String s,int fallback,int min,int max){try{return Math.max(min,Math.min(max,Integer.parseInt(s)));}catch(Exception e){return fallback;}}
    private static String safe(String x,int max){return x==null?"":x.length()>max?x.substring(0,max):x;}
    private void handle(HttpExchange x) throws IOException {
        String path=x.getRequestURI().getPath();String method=x.getRequestMethod();
        x.getResponseHeaders().set("X-Content-Type-Options","nosniff");
        x.getResponseHeaders().set("Referrer-Policy","strict-origin-when-cross-origin");
        x.getResponseHeaders().set("X-Frame-Options","DENY");
        x.getResponseHeaders().set("Content-Security-Policy","default-src 'self'; script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com; style-src 'self'; img-src 'self' https: data:; media-src 'self' https: blob:; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://w.soundcloud.com; connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'");
        if(!cors.isBlank()){x.getResponseHeaders().set("Access-Control-Allow-Origin",cors);x.getResponseHeaders().set("Vary","Origin");x.getResponseHeaders().set("Access-Control-Allow-Headers","Authorization, Content-Type");x.getResponseHeaders().set("Access-Control-Allow-Methods","GET, PUT, OPTIONS");}
        if(method.equals("OPTIONS")){x.sendResponseHeaders(204,-1);x.close();return;}
        try {
            if(path.startsWith("/api/")){
                if(!method.equals("GET")&&!method.equals("HEAD")&&!path.equals("/api/v1/library")){reply(x,405,Json.obj("error","method_not_allowed"));return;}
                if(path.startsWith("/api/v1/lyrics")||path.startsWith("/api/v1/search")||path.equals("/api/v1/info")){
                    if(!withinRate(x,35)){reply(x,429,Json.obj("error","rate_limited","message","Terlalu banyak permintaan"));return;}
                }
                api(x,path,query(x.getRequestURI().getRawQuery()));
            } else if(method.equals("GET")||method.equals("HEAD")) staticFile(x,path);
            else reply(x,405,Json.obj("error","method_not_allowed"));
        } catch(IllegalArgumentException e){reply(x,400,Json.obj("error","bad_request","message",safe(String.valueOf(e.getMessage()),160)));}
        catch(Exception e){System.err.println("Aurelis "+path+": "+e.getClass().getSimpleName()+" "+e.getMessage());reply(x,502,Json.obj("error","upstream_or_internal_error","message",safe(String.valueOf(e.getMessage()),140)));}
    }
    private boolean withinRate(HttpExchange x,int max){String ip=x.getRemoteAddress().getAddress().getHostAddress();long now=System.currentTimeMillis();
        if(limits.size()>10000)limits.clear();
        Window w=limits.compute(ip,(k,v)->v==null||now-v.started>60_000?new Window(now,1):new Window(v.started,v.count+1));
        return w.count<=max;
    }
    private void api(HttpExchange x,String path,Map<String,String> q) throws Exception {
        String search=safe(q.getOrDefault("q",q.getOrDefault("query","")),160).trim();
        String track=safe(q.getOrDefault("track",search),180).trim(), artist=safe(q.getOrDefault("artist",""),180).trim();
        int duration=boundedInt(q.get("duration"),0,0,7200);
        if(path.equals("/api/v1/health")){reply(x,200,Json.obj("ok",true,"service","Aurelis Symphony","version","1.0.0","time",Instant.now().toString()));return;}
        if(path.equals("/api/v1/config")){reply(x,200,Json.obj("name","Aurelis Symphony","version","1.0.0","cloudLibrary",cloudLibrary,"searchProviders",List.of("youtube","soundcloud","bandcamp","peertube","mediaccc"),"lyricsSources",Lyrics.sources()));return;}
        if(path.equals("/api/v1/catalog")){List<Object> tracks=new ArrayList<>();for(Object t:catalog)if(search.isBlank()||(Json.get(t,"title")+" "+Json.get(t,"artist")).toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))tracks.add(t);
            reply(x,200,Json.obj("tracks",tracks.subList(0,Math.min(tracks.size(),boundedInt(q.get("limit"),40,1,100))),"total",tracks.size()));return;}
        if(path.startsWith("/api/v1/tracks/")){String id=path.substring("/api/v1/tracks/".length());for(Object t:catalog)if(Json.get(t,"id").equals(id)){reply(x,200,Json.obj("track",t));return;}reply(x,404,Json.obj("error","not_found"));return;}
        if(path.equals("/api/v1/search")){
            if(search.isBlank()){reply(x,400,Json.obj("error","query_required"));return;}
            String provider=q.getOrDefault("provider","youtube");
            if(provider.equals("catalog")){api(x,"/api/v1/catalog",q);return;}
            if(!List.of("youtube","soundcloud","bandcamp","peertube","mediaccc").contains(provider)){reply(x,400,Json.obj("error","invalid_provider"));return;}
            try{Object tracks=invokeBridge("search",new Class[]{String.class,String.class},search,provider);reply(x,200,Json.obj("provider",provider,"tracks",tracks,"notice","External streams may not be browser-playable or available in every region"));}
            catch(Exception e){reply(x,503,Json.obj("error","search_unavailable","message",safe(e.getMessage(),160),"tracks",List.of()));}return;
        }
        if(path.equals("/api/v1/info")){
            String url=q.getOrDefault("url","");if(url.length()>500||!url.startsWith("https://"))throw new IllegalArgumentException("Valid HTTPS media URL required");
            try{reply(x,200,Json.obj("track",invokeBridge("info",new Class[]{String.class},url)));}catch(Exception e){reply(x,503,Json.obj("error","info_unavailable","message",safe(e.getMessage(),150)));}return;
        }
        if(path.equals("/api/v1/lyrics/sources")){reply(x,200,Json.obj("sources",Lyrics.sources()));return;}
        if(path.equals("/api/v1/lyrics")){reply(x,200,lyrics.find(track,artist,duration,q.getOrDefault("source","")));return;}
        if(path.equals("/api/v1/lyrics/all")){reply(x,200,lyrics.all(track,artist,duration));return;}
        if(path.equals("/api/v1/lyrics/lrc")){
            Object result=Json.at(lyrics.find(track,artist,duration,q.getOrDefault("source","")),"result");
            if(result==null){reply(x,404,Json.obj("error","lyrics_not_found"));return;}
            String body=Lyrics.lrc(result,"enhanced".equalsIgnoreCase(q.getOrDefault("format","")));
            raw(x,200,"text/plain; charset=utf-8",body.getBytes(StandardCharsets.UTF_8),null);return;
        }
        if(path.equals("/api/v1/library")){library(x);return;}
        if(path.equals("/api/v1/openapi.json")){byte[] bytes=resource("/web/openapi.json");raw(x,200,"application/json; charset=utf-8",bytes,null);return;}
        reply(x,404,Json.obj("error","not_found","path",path));
    }
    private static Object invokeBridge(String name,Class<?>[] types,Object... args)throws Exception{
        try{return Class.forName("dev.aurelis.NewPipeBridge").getMethod(name,types).invoke(null,args);}
        catch(InvocationTargetException e){Throwable t=e.getCause();throw new IllegalStateException(t==null?e.getMessage():t.getClass().getSimpleName()+": "+t.getMessage(),t);}
        catch(ClassNotFoundException e){throw new IllegalStateException("NewPipe dependency not included in this build");}
    }
    private void library(HttpExchange x)throws Exception {
        if(!cloudLibrary){reply(x,403,Json.obj("error","cloud_library_disabled","message","Browser keeps library locally by default"));return;}
        String auth=x.getRequestHeaders().getFirst("Authorization");
        if(auth==null||!auth.matches("Bearer [0-9a-fA-F]{64}")){reply(x,401,Json.obj("error","library_token_required"));return;}
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(auth.substring(7).getBytes(StandardCharsets.UTF_8));
        String id=HexFormat.of().formatHex(digest);Path dir=dataDir.resolve("libraries");Path target=dir.resolve(id+".json");
        if(x.getRequestMethod().equals("GET")){reply(x,200,Files.exists(target)?Json.parse(Files.readString(target)):Json.obj("favorites",List.of(),"playlists",List.of()));return;}
        if(!x.getRequestMethod().equals("PUT")){reply(x,405,Json.obj("error","method_not_allowed"));return;}
        int contentLength=boundedInt(x.getRequestHeaders().getFirst("Content-Length"),0,0,100_001);
        if(contentLength>100_000){reply(x,413,Json.obj("error","payload_too_large"));return;}
        byte[] bytes=x.getRequestBody().readNBytes(100_001);
        if(bytes.length>100_000){reply(x,413,Json.obj("error","payload_too_large"));return;}
        Object input=Json.parse(new String(bytes,StandardCharsets.UTF_8));
        if(!(input instanceof Map)){reply(x,400,Json.obj("error","object_expected"));return;}
        synchronized(libraryLock){Files.createDirectories(dir);Path temp=Files.createTempFile(dir,"write-",".json");Files.writeString(temp,Json.stringify(input));try{Files.move(temp,target,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}catch(AtomicMoveNotSupportedException e){Files.move(temp,target,StandardCopyOption.REPLACE_EXISTING);}}
        reply(x,200,Json.obj("ok",true));
    }
    private void reply(HttpExchange x,int status,Object o)throws IOException{raw(x,status,"application/json; charset=utf-8",Json.stringify(o).getBytes(StandardCharsets.UTF_8),null);}
    private static byte[] resource(String path)throws IOException{try(InputStream in=AurelisServer.class.getResourceAsStream(path)){if(in==null)throw new FileNotFoundException(path);return in.readAllBytes();}}
    private void staticFile(HttpExchange x,String path)throws IOException{
        if(path.equals("/"))path="/index.html";
        if(path.contains("..")||path.contains("\\")||!path.matches("/[a-zA-Z0-9_./-]+")){reply(x,404,Json.obj("error","not_found"));return;}
        byte[] content;
        try{content=resource("/web"+path);}catch(FileNotFoundException e){reply(x,404,Json.obj("error","not_found"));return;}
        String mime=path.endsWith(".html")?"text/html; charset=utf-8":path.endsWith(".css")?"text/css; charset=utf-8":path.endsWith(".js")?"text/javascript; charset=utf-8":path.endsWith(".json")?"application/json":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".ogg")?"audio/ogg":path.endsWith(".mp3")?"audio/mpeg":"application/octet-stream";
        x.getResponseHeaders().set("Cache-Control",path.startsWith("/assets/")||path.startsWith("/demo/")?"public, max-age=86400":"no-cache");
        raw(x,200,mime,content,x.getRequestHeaders().getFirst("Range"));
    }
    private static void raw(HttpExchange x,int status,String contentType,byte[] bytes,String range)throws IOException{
        x.getResponseHeaders().set("Content-Type",contentType);
        x.getResponseHeaders().set("Accept-Ranges","bytes");
        int from=0,to=bytes.length-1;
        if(range!=null&&range.matches("bytes=\\d*-\\d*")){
            try{String[] a=range.substring(6).split("-",-1);if(a[0].isBlank()){int suffix=Integer.parseInt(a[1]);from=Math.max(0,bytes.length-suffix);}else{from=Integer.parseInt(a[0]);if(!a[1].isBlank())to=Math.min(to,Integer.parseInt(a[1]));}if(from<0||from>=bytes.length||to<from)throw new NumberFormatException();status=206;x.getResponseHeaders().set("Content-Range","bytes "+from+"-"+to+"/"+bytes.length);}catch(NumberFormatException e){x.getResponseHeaders().set("Content-Range","bytes */"+bytes.length);x.sendResponseHeaders(416,-1);x.close();return;}
        }
        int count=Math.max(0,to-from+1);x.sendResponseHeaders(status,x.getRequestMethod().equals("HEAD")?-1:count);
        if(!x.getRequestMethod().equals("HEAD"))try(OutputStream out=x.getResponseBody()){out.write(bytes,from,count);}else x.close();
    }
}
