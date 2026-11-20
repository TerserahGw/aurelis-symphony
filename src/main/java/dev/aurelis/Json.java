package dev.aurelis;

import java.util.*;

/** Dependency-free JSON codec for the small REST payloads in Aurelis. */
public final class Json {
    private Json() {}
    public static Map<String, Object> obj(Object... pairs) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i=0; i+1<pairs.length; i+=2) m.put(String.valueOf(pairs[i]), pairs[i+1]);
        return m;
    }
    @SuppressWarnings("unchecked")
    public static Map<String,Object> map(Object x) { return x instanceof Map<?,?> ? (Map<String,Object>)x : Collections.emptyMap(); }
    @SuppressWarnings("unchecked")
    public static List<Object> list(Object x) { return x instanceof List<?> ? (List<Object>)x : Collections.emptyList(); }
    public static Object at(Object x,String... path) { for(String p:path) { x=map(x).get(p); if(x==null) return null; } return x; }
    public static String str(Object x) { return x==null ? "" : String.valueOf(x); }
    public static String get(Object x,String... path) { return str(at(x,path)); }
    public static double num(Object x) { try { return x instanceof Number ? ((Number)x).doubleValue() : Double.parseDouble(str(x)); }catch(Exception e){return 0;} }
    public static boolean truth(Object x) {return x instanceof Boolean b && b;}
    public static String stringify(Object x) { StringBuilder sb=new StringBuilder(); write(sb,x); return sb.toString(); }
    private static void write(StringBuilder b, Object x) {
        if(x==null){b.append("null");return;}
        if(x instanceof String || x instanceof Character){b.append('"');for(char c:String.valueOf(x).toCharArray()) switch(c){case '"'->b.append("\\\"");case '\\'->b.append("\\\\");case '\n'->b.append("\\n");case '\r'->b.append("\\r");case '\t'->b.append("\\t");default->{if(c<32) b.append(String.format("\\u%04x",(int)c));else b.append(c);}}b.append('"');return;}
        if(x instanceof Number || x instanceof Boolean){ b.append(x); return; }
        if(x instanceof Map<?,?> map){b.append('{');int i=0;for(var e:map.entrySet()){if(i++>0)b.append(',');write(b,String.valueOf(e.getKey()));b.append(':');write(b,e.getValue());}b.append('}');return;}
        if(x instanceof Iterable<?> it){b.append('[');int i=0;for(Object v:it){if(i++>0)b.append(',');write(b,v);}b.append(']');return;}
        write(b,String.valueOf(x));
    }
    public static Object parse(String s) {Parser p=new Parser(s);Object v=p.value();p.ws();if(p.i!=s.length())throw new IllegalArgumentException("Trailing JSON data");return v;}
    private static final class Parser {
        final String s;int i=0;Parser(String s){this.s=s;}
        void ws(){while(i<s.length()&&Character.isWhitespace(s.charAt(i)))i++;}
        char ch(){return i<s.length()?s.charAt(i):'\0';}
        void need(char c){ws();if(ch()!=c) throw new IllegalArgumentException("Expected "+c+" at "+i);i++;}
        Object value(){ws();char c=ch();if(c=='"')return string();if(c=='{')return object();if(c=='[')return array();if(c=='t'&&s.startsWith("true",i)){i+=4;return true;}if(c=='f'&&s.startsWith("false",i)){i+=5;return false;}if(c=='n'&&s.startsWith("null",i)){i+=4;return null;}if(c=='-'||Character.isDigit(c))return number();throw new IllegalArgumentException("Invalid JSON at "+i);}
        String string(){need('"');StringBuilder b=new StringBuilder();while(i<s.length()){char c=s.charAt(i++);if(c=='"')return b.toString();if(c=='\\'){if(i>=s.length())break;char e=s.charAt(i++);switch(e){case '"'->b.append('"');case '\\'->b.append('\\');case '/'->b.append('/');case 'b'->b.append('\b');case 'f'->b.append('\f');case 'n'->b.append('\n');case 'r'->b.append('\r');case 't'->b.append('\t');case 'u'->{if(i+4>s.length())throw new IllegalArgumentException("Invalid unicode");b.append((char)Integer.parseInt(s.substring(i,i+4),16));i+=4;}default->throw new IllegalArgumentException("Invalid escape");}}else b.append(c);}throw new IllegalArgumentException("Unterminated string");}
        Object object(){need('{');Map<String,Object> m=new LinkedHashMap<>();ws();if(ch()=='}'){i++;return m;}while(true){ws();String k=string();need(':');m.put(k,value());ws();if(ch()=='}'){i++;return m;}need(',');}}
        Object array(){need('[');List<Object> a=new ArrayList<>();ws();if(ch()==']'){i++;return a;}while(true){a.add(value());ws();if(ch()==']'){i++;return a;}need(',');}}
        Object number(){int start=i;if(ch()=='-')i++;while(Character.isDigit(ch()))i++;if(ch()=='.'){i++;while(Character.isDigit(ch()))i++;}if(ch()=='e'||ch()=='E'){i++;if(ch()=='+'||ch()=='-')i++;while(Character.isDigit(ch()))i++;}String n=s.substring(start,i);if(n.contains(".")||n.contains("e")||n.contains("E"))return Double.valueOf(n);return Long.valueOf(n);}
    }
}
