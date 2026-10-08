# Costruita dalla radice del repository (vedi compose.yaml): compila il codice sorgente.
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json LICENSE ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund
RUN npm run build:runtime && npm run build:platform
# La CLI, distribuita da ogni istanza: npm install -g https://<istanza>/cli/sharebox.tgz
RUN npm run build:cli && mkdir /src/cli && npm pack -w packages/cli --pack-destination /src/cli && mv /src/cli/*.tgz /src/cli/sharebox.tgz

FROM node:24-alpine
RUN mkdir /data && chown node:node /data
COPY --from=build /src/deploy/platform/platform.mjs /src/deploy/platform/runtime-entry.js /app/
COPY --from=build /src/deploy/platform/dashboard /app/dashboard
COPY --from=build /src/cli/sharebox.tgz /app/cli/sharebox.tgz
USER node
CMD ["node", "/app/platform.mjs"]
