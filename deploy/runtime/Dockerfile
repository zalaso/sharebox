FROM node:24-slim
# workerd: runtime open source dei Worker Cloudflare (ADR 0005).
# I file del tool arrivano in /tool/code, montati in sola lettura dall'orchestratore.
RUN npm install -g workerd@1.20260926.1 \
 && mkdir -p /tool/code /data \
 && chown node:node /data
COPY config.capnp /tool/config.capnp
USER node
EXPOSE 8080
CMD ["workerd", "serve", "/tool/config.capnp"]
