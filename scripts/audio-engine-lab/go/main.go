package main

import (
 "context"
 "encoding/json"
 "fmt"
 "io"
 "net/http"
 "os"
 "strings"
 "time"
 "github.com/kkdai/youtube/v2"
)

func probe(id string) (string,int,error) {
 ctx,cancel:=context.WithTimeout(context.Background(),25*time.Second)
 defer cancel()
 c:=youtube.Client{HTTPClient:&http.Client{Timeout:15*time.Second}}
 v,e:=c.GetVideoContext(ctx,id)
 if e!=nil{return "",0,e}
 a:=v.Formats.Select(func(f youtube.Format)bool{return strings.HasPrefix(f.MimeType,"audio/")})
 if len(a)==0{return "",0,fmt.Errorf("no audio-only format")}
 a.Sort()
 body,_,e:=c.GetStreamContext(ctx,v,&a[0])
 if e!=nil{return "",0,e}
 defer body.Close()
 buf:=make([]byte,4096)
 n,e:=io.ReadFull(body,buf)
 if e!=nil{return a[0].MimeType,n,e}
 return a[0].MimeType,n,nil
}
func main(){
 failures:=0
 for _,id:=range os.Args[1:]{
  mime,n,e:=probe(id)
  out:=map[string]interface{}{"engine":"kkdai/youtube","videoId":id,"mime":mime,"bytes":n,"ok":e==nil}
  if e!=nil{failures++;out["errorType"]=fmt.Sprintf("%T",e)}
  data,_:=json.Marshal(out);fmt.Println(string(data))
 }
 if failures>0{os.Exit(1)}
}
