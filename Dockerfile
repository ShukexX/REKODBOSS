# Rekod Boss — Node.js + PostgreSQL runtime untuk Dokploy
FROM node:22-bookworm-slim AS build

# Dokploy builds this image from the repository root. Keep the build
# deterministic by installing exactly what package-lock.json describes.
ENV NODE_ENV=development

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--enable-source-maps

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# The app stores business data in PostgreSQL, so it does not need write access
# to the image filesystem. Running as the built-in node user is safer for
# Dokploy and still allows the health check to run.
USER node

CMD ["node", "dist-server/server-node.js"]

