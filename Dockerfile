FROM node:22-alpine
WORKDIR /app
# Optional online audio resolver, pinned stable release; no runtime auto-updater.
RUN apk add --no-cache python3 py3-pip && python3 -m venv /opt/yt-dlp && /opt/yt-dlp/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.11.23' && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp && yt-dlp --version
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 AURELIS_CLOUD_LIBRARY=false NODE_OPTIONS=--max-old-space-size=256
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./server.mjs
COPY server ./server
COPY src/main/resources/web ./src/main/resources/web
RUN addgroup -S aurelis && adduser -S aurelis -G aurelis && mkdir -p /app/data && chown -R aurelis:aurelis /app/data
USER aurelis
EXPOSE 8080
CMD ["node", "server.mjs"]
