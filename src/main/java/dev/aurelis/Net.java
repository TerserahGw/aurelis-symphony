package dev.aurelis;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/** Fixed-provider HTTPS calls, size cap, timeouts and bounded cache. No arbitrary-URL fetching endpoint. */
public final class Net {
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NORMAL).build();
    private final Map<String,Entry> cache= new ConcurrentHashMap<>();
    private record Entry(String value,long until){}
    public String get(String url) throws Exception {return fetch("GET",url,null,Map.of());}
    public String get(String url,Map<String,String> headers) throws Exception {return fetch("GET",url,null,headers);}
    public String post(String url,String payload,Map<String,String> headers) throws Exception {return fetch("POST",url,payload,headers);}
    public String fetch(String method,String url,String payload,Map<String,String> headers) throws Exception {
        URI uri=URI.create(url);
        if(!"https".equals(uri.getScheme()) && !("http".equals(uri.getScheme()) && uri.getHost().equals("mobilecdn.kugou.com"))) throw new IllegalArgumentException("Only approved providers");
        String key=method+url+(payload==null?"":payload);
        if(method.equals("GET")){Entry hit=cache.get(key);if(hit!=null&&System.currentTimeMillis()<hit.until)return hit.value;}
        HttpRequest.Builder b=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(11)).header("User-Agent","AurelisSymphony/1.0 (+https://github.com/TerserahGw/aurelis-symphony)").header("Accept","application/json,text/plain,*/*");
        headers.forEach(b::header);
        b.method(method,payload==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(payload));
        HttpResponse<byte[]> r=client.send(b.build(),HttpResponse.BodyHandlers.ofByteArray());
        if(r.statusCode()<200||r.statusCode()>=300)throw new IllegalStateException("Upstream HTTP "+r.statusCode());
        if(r.body().length>2_000_000)throw new IllegalStateException("Upstream response too large");
        String value=new String(r.body(),StandardCharsets.UTF_8);
        if(method.equals("GET")&&cache.size()<350)cache.put(key,new Entry(value,System.currentTimeMillis()+120_000));
        return value;
    }
    public static String enc(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8);}
}
