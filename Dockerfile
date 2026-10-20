# Crowd Kit: Next.js app + Qloo's `qloo mcp` harness in one long-running container.
# Deploy on Render / Railway / Fly.io. Set ANTHROPIC_API_KEY and QLOO_API_KEY as
# secrets in the host's dashboard; never bake them into the image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# Qloo's event-supported access route (https://github.com/qloo/qloo-hackathon-kit)
RUN npm install --global @qloo/qloo-harness@0.1.26 && qloo --version
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
