FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Uploaded files live on a volume so they survive redeploys.
RUN mkdir -p /app/uploads/private && chown -R node:node /app
VOLUME ["/app/uploads"]

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-5000}/ || exit 1

CMD ["node", "server.js"]
