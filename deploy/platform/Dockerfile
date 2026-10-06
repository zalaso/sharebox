# Costruita dalla radice del repository (vedi compose.yaml): compila il codice sorgente.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build:runtime && npm run build:platform

FROM node:24-alpine
RUN mkdir /data && chown node:node /data
COPY --from=build /src/deploy/platform/platform.mjs /src/deploy/platform/runtime-entry.js /app/
COPY --from=build /src/deploy/platform/dashboard /app/dashboard
USER node
CMD ["node", "/app/platform.mjs"]
