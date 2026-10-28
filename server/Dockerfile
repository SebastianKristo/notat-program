FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /data/files && chown node /data/files
USER node
EXPOSE 3000
CMD ["node", "index.js"]
