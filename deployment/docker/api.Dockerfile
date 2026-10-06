FROM node:22-bookworm-slim
WORKDIR /app
COPY services/api/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services/api/ ./
# Source files from restrictive checkouts can be mode 0600. The node user
# needs read access to the application and traversal access to its directories.
RUN chmod -R a+rX /app
ENV NODE_ENV=production LISTEN_ADDR=0.0.0.0 PORT=8080
USER node
EXPOSE 8080
CMD ["node","server.js"]
