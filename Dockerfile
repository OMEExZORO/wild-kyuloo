# Crowd Kit: Next.js app + Qloo's `qloo mcp` harness in one long-running container.
# Deploy on Render / Railway / Fly.io. Set ANTHROPIC_API_KEY and QLOO_API_KEY as
# secrets in the host's dashboard; never bake them into the image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
    CROWDKIT_CACHE_DIR=/app/.cache
# Hackathon keys only work on the hackathon server, not qloo's default api.qloo.com.
# The harness sends a key to a custom URL only when both variables name it.
ENV QLOO_BASE_URL=https://hackathon.api.qloo.com QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
# Qloo's event-supported access route (https://github.com/qloo/qloo-hackathon-kit).
# Installed as root into /usr/local, so the unprivileged `node` user can run it.
RUN npm install --global @qloo/qloo-harness@0.1.26 && qloo --version
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Writable response cache for the `node` user. To keep it across deploys, mount a
# persistent disk/volume here (the mount must be writable by uid 1000).
RUN mkdir -p /app/.cache && chown node:node /app/.cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
