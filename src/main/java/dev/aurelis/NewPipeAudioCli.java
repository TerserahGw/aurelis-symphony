package dev.aurelis;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Isolated optional audio resolver, with a separate byte probe for permitted public media. */
public final class NewPipeAudioCli {
    private static boolean allowed(String value) {
        try {
            URI u=URI.create(value);
            String host=u.getHost();
            return "https".equals(u.getScheme()) && u.getUserInfo()==null && u.getPort()==-1
                && host!=null && (host.equals("googlevideo.com")||host.endsWith(".googlevideo.com"));
        } catch(Exception e) { return false; }
    }
    private static boolean accessRequired(Throwable e) {
        for(Throwable t=e;t!=null;t=t.getCause()) {
            String s=(t.getClass().getSimpleName()+" "+String.valueOf(t.getMessage())).toLowerCase(Locale.ROOT);
            if(s.contains("recaptcha")||s.contains("confirmnotbot")||s.contains("login_required")||
               s.contains("confirm that you're not a bot")||s.contains("confirm you’re not a bot")||
               s.contains("private video")||s.contains("age-restrict")||s.contains("members-only")||
               s.contains("contentnotavailable")||s.contains("content isn’t available")||s.contains("content isn't available"))
                return true;
        }
        return false;
    }
    public static void main(String[] args) {
        boolean probe=args.length==2 && args[0].equals("--probe");
        String id=probe?args[1]:args.length==1?args[0]:"";
        if(!id.matches("[A-Za-z0-9_-]{11}")) { System.out.println("{\"ok\":false,\"code\":\"invalid_id\"}"); return; }
        try {
            Object info=NewPipeBridge.info("https://www.youtube.com/watch?v="+id);
            List<Object> streams=new ArrayList<>(Json.list(Json.at(info,"audio")));
            streams.removeIf(s->!"PROGRESSIVE_HTTP".equals(Json.get(s,"delivery")) || !allowed(Json.get(s,"url")));
            streams.sort(Comparator.comparingInt((Object s)->Json.get(s,"format").toLowerCase(Locale.ROOT).contains("m4a")?1:0)
                .thenComparingDouble(s->Json.num(Json.at(s,"bitrate"))).reversed());
            if(streams.isEmpty()) { System.out.println("{\"ok\":false,\"code\":\"newpipe_no_audio\"}"); return; }
            String url=Json.get(streams.get(0),"url");
            if(!probe) {
                // stdout is captured by Node, never sent to a user or printed to CI.
                System.out.println(Json.stringify(Json.obj("ok",true,"url",url)));return;
            }
            HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NEVER).build();
            HttpRequest req=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).header("Range","bytes=0-4095").header("Accept-Encoding","identity").build();
            HttpResponse<java.io.InputStream> response=http.send(req,HttpResponse.BodyHandlers.ofInputStream());
            try(var stream=response.body()) {
                String mime=response.headers().firstValue("Content-Type").orElse("");
                int n=response.statusCode()==206&&mime.startsWith("audio/")?stream.readNBytes(4096).length:0;
                System.out.println(Json.stringify(Json.obj("engine","NewPipeExtractor","ok",n==4096,"http",response.statusCode(),"mime",mime,"bytes",n)));
            }
        } catch(Exception e) {
            System.out.println(Json.stringify(Json.obj("ok",false,"code",accessRequired(e)?"youtube_access_required":"newpipe_unavailable","errorType",e.getClass().getSimpleName())));
        }
    }
}
