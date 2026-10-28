FROM node:22-alpine
RUN apk add --no-cache samba-client postgresql16-client zstd openssl tar
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY secret.js ./
COPY backup/backup.mjs ./backup/
CMD ["node", "backup/backup.mjs"]
