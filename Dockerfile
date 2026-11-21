FROM node:22-alpine
WORKDIR /app
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
