#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d)
PORT="${SMOKE_PORT:-18888}"
cleanup(){ [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM
mkdir -p "$TMP/classes"
# Compile the JDK-only layer without downloading external NewPipe packages.
javac -encoding UTF-8 -d "$TMP/classes" "$ROOT/src/main/java/dev/aurelis/Json.java" "$ROOT/src/main/java/dev/aurelis/Net.java" "$ROOT/src/main/java/dev/aurelis/Lyrics.java" "$ROOT/src/main/java/dev/aurelis/AurelisServer.java"
cp -R "$ROOT/src/main/resources/web" "$TMP/classes/web"
HOST=127.0.0.1 PORT="$PORT" java -Xms32m -Xmx128m -cp "$TMP/classes" dev.aurelis.AurelisServer > "$TMP/server.log" 2>&1 &
PID=$!
i=0
until curl -fsS "http://127.0.0.1:$PORT/api/v1/health" > "$TMP/health.json"; do
  i=$((i+1)); [ "$i" -lt 40 ] || { cat "$TMP/server.log"; exit 1; }; sleep .2
done
curl -fsS "http://127.0.0.1:$PORT/" | grep -q 'Aurelis Symphony'
curl -fsS "http://127.0.0.1:$PORT/api/v1/catalog" | grep -q 'Aether Bloom'
curl -fsS "http://127.0.0.1:$PORT/api/v1/lyrics/sources" | grep -q 'lyricsovh'
curl -fsS "http://127.0.0.1:$PORT/api/v1/openapi.json" | grep -q 'openapi'
RANGE=$(curl -fsS -H 'Range: bytes=0-99' -o "$TMP/range" -w '%{http_code}' "http://127.0.0.1:$PORT/demo/aether-bloom.mp3")
[ "$RANGE" = '206' ] && [ "$(wc -c < "$TMP/range" | tr -d ' ')" = '100' ]
printf 'OK: health, HTML, catalog, lyric providers, OpenAPI, and 206 audio Range.\n'
