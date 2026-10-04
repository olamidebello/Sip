FROM node:22-bookworm-slim
WORKDIR /app
COPY services/api/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/api/ ./
ENV NODE_ENV=production LISTEN_ADDR=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node","server.js"]
