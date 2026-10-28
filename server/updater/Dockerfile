FROM node:22-alpine
RUN apk add --no-cache git docker-cli docker-cli-compose
RUN git config --global --add safe.directory "*"
COPY updater.mjs /updater.mjs
CMD ["node", "/updater.mjs"]
