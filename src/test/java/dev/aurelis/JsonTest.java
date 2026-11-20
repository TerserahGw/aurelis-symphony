package dev.aurelis;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

public class JsonTest {
    @Test void roundtripInternationalJson() {
        Object original=Json.obj("title","晴天", "duration",248L, "lines",List.of(Json.obj("time",1.23,"text","Morning \"light\"")),"enabled",true);
        Object result=Json.parse(Json.stringify(original));
        assertEquals("晴天",Json.get(result,"title"));
        assertEquals(248.0,Json.num(Json.at(result,"duration")));
        assertEquals(true,Json.at(result,"enabled"));
    }
    @Test void rejectsMalformedData() {assertThrows(IllegalArgumentException.class,()->Json.parse("{oops}"));}
    @Test void numbersRemainIntegerWhenParsed() {assertEquals("123",Json.stringify(Json.parse("123")));}
}
