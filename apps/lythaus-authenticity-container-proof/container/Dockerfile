FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.mjs"]
