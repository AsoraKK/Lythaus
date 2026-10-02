FROM node:22-bookworm-slim
WORKDIR /app
COPY container/server.mjs ./server.mjs
ENV NODE_ENV=production
ENV PORT=8080
USER node
CMD ["node", "server.mjs"]
