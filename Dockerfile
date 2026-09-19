# Lumen Analytics demo container. Three stages: install, build (seeds the
# synthetic SQLite database and runs anomaly detection, then compiles the
# standalone Next.js server), and a slim runtime. The database ships inside
# the image, read-mostly: anomaly triage is per-visitor and client-side
# (localStorage), not a container-layer write, and resets to the seeded
# state on redeploy (or per browser, on a cleared localStorage), which is
# the intended behavior for a demo.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source via node-gyp on this base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# seed:full = seed + detect; the dataset anchors to the build date so the
# demo always reads as current. Rebuilding refreshes the data window.
RUN npm run seed:full && npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/data ./data
RUN chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
