package dev.aurelis;

import org.schabi.newpipe.extractor.*;
import org.schabi.newpipe.extractor.downloader.*;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;
import org.schabi.newpipe.extractor.search.SearchExtractor;
import org.schabi.newpipe.extractor.stream.*;

import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Small server-side adapter; no hidden API key, proxy or media ripping. */
public final class NewPipeBridge {
    private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();
    static {
        NewPipe.init(new Downloader() {
            @Override public Response execute(Request req) throws IOException, ReCaptchaException {
                try {
                    HttpRequest.Builder b=HttpRequest.newBuilder(URI.create(req.url())).timeout(Duration.ofSeconds(20));
                    b.header("User-Agent","Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0");
                    b.header("Accept-Encoding","identity");
                    if(req.headers()!=null) for(var e:req.headers().entrySet()) for(String v:e.getValue()) if(!e.getKey().equalsIgnoreCase("Host")&&!e.getKey().equalsIgnoreCase("Content-Length")&&!e.getKey().equalsIgnoreCase("Accept-Encoding")&&!e.getKey().equalsIgnoreCase("User-Agent"))b.header(e.getKey(),v);
                    b.method(req.httpMethod(),req.dataToSend()==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofByteArray(req.dataToSend()));
                    HttpResponse<String> resp=HTTP.send(b.build(),HttpResponse.BodyHandlers.ofString());
                    return new Response(resp.statusCode(),"HTTP "+resp.statusCode(),resp.headers().map(),resp.body(),resp.uri().toString());
                } catch(InterruptedException ex){Thread.currentThread().interrupt();throw new IOException("Interrupted",ex);}
                catch(IllegalArgumentException ex){throw new IOException("Invalid downloader request",ex);}
            }
        });
    }
    private NewPipeBridge() {}
    private static String thumb(List<Image> images){return images==null||images.isEmpty()?"":images.get(images.size()-1).getUrl();}
    public static List<Object> search(String query,String provider) throws Exception {
        if(query==null||query.isBlank()||query.length()>160) return List.of();
        StreamingService service=service(provider);
        SearchExtractor search=service.getSearchExtractor(query);
        search.fetchPage();
        List<Object> items=new ArrayList<>();
        for(InfoItem item:search.getInitialPage().getItems()){
            if(!(item instanceof StreamInfoItem s))continue;
            items.add(Json.obj("id",s.getUrl(),"url",s.getUrl(),"title",s.getName(),"artist",s.getUploaderName(),"duration",s.getDuration(),"artwork",thumb(s.getThumbnails()),"provider",provider,"type","external"));
            if(items.size()>=24)break;
        }
        return items;
    }
    public static Object info(String url) throws Exception {
        if(url==null||url.length()>500||!url.startsWith("https://"))throw new IllegalArgumentException("HTTPS URL required");
        StreamingService service=NewPipe.getServiceByUrl(url);
        StreamInfo info=StreamInfo.getInfo(service,url);
        List<Object> audio=new ArrayList<>();
        for(AudioStream stream:info.getAudioStreams()){
            if(!stream.isUrl())continue;
            audio.add(Json.obj("url",stream.getUrl(),"bitrate",stream.getAverageBitrate(),"format",String.valueOf(stream.getFormat()),"delivery",String.valueOf(stream.getDeliveryMethod())));
        }
        audio.sort((a,b)->Double.compare(Json.num(Json.at(b,"bitrate")),Json.num(Json.at(a,"bitrate"))));
        return Json.obj("id",url,"url",info.getUrl(),"title",info.getName(),"artist",info.getUploaderName(),"duration",info.getDuration(),"artwork",thumb(info.getThumbnails()),"audio",audio,"provider",service.getServiceInfo().getName());
    }
    private static StreamingService service(String provider) throws Exception{
        return NewPipe.getService(switch(provider.toLowerCase(Locale.ROOT)){
            case "soundcloud"->"SoundCloud";case "bandcamp"->"Bandcamp";case "peertube"->"PeerTube";case "mediaccc"->"media.ccc.de";default->"YouTube";});
    }
}
