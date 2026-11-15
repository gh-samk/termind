# syntax=docker/dockerfile:1

# ---------- Build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && cp -r server/db/migrations dist/server/migrations
# Laufzeit braucht nur die nativen Pakete (alles andere steckt im Bundle)
# Exakte Versionen aus dem Lockfile (node_modules der Build-Stufe), keine Bereiche
RUN node -e "const keep=['@libsql/client','@node-rs/argon2'];const v=k=>require('./node_modules/'+k+'/package.json').version;require('fs').writeFileSync('dist/package.json',JSON.stringify({name:'termind',private:true,type:'module',dependencies:Object.fromEntries(keep.map(k=>[k,v(k)]))}))" \
 && cd dist && npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- Laufzeit ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    NODE_OPTIONS=--max-old-space-size=192
LABEL org.opencontainers.image.title="termind" \
      org.opencontainers.image.description="Schlanke, selbst hostbare Terminbuchung mit MCP" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/gh-samk/termind"
WORKDIR /app
COPY --from=build /app/dist ./
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server/index.js"]
