# Costruita dalla radice del repository (vedi compose.yaml): compila il codice sorgente.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build:orchestrator

FROM node:24-alpine
# Gira come root: serve per usare il socket di Docker (ADR 0008).
COPY --from=build /src/deploy/orchestrator/orchestrator.mjs /app/orchestrator.mjs
CMD ["node", "/app/orchestrator.mjs"]
