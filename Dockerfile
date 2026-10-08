# Boarding House — game server + game (one container). Used by Fly.io (fly.toml) and Railway (railway.json).
FROM node:22-slim
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY . .
ENV PORT=8080 HOST=0.0.0.0 DATA_FILE=/data/db.json SOCIAL_FILE=/data/social.json
EXPOSE 8080
CMD ["node", "server/index.js"]
