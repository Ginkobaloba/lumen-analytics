# Lumen Analytics demo container. Three stages: install, build (seeds the
# synthetic SQLite database and runs anomaly detection, then compiles the
# standalone Next.js server), and a slim runtime. The database ships inside
# the image, read-mostly: anomaly triage is per-visitor and client-side
# (localStorage), not a container-layer write, and resets to the seeded
# state on redeploy (or per browser, on a cleared localStorage), which is
# the intended behavior for a demo.
#
# Node 22 (node 20 is EOL, team standard is node 22; see
# docs/demos/lumen/decisions.md).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3@12.10.0 ships a prebuilt binary for node 22 linux-x64
# (ABI 127), so no compiler toolchain is needed here; proven by a clean
# `docker build` with python3/make/g++ removed (see decisions.md). If
# prebuild-install ever times out fetching the release asset with no
# node-gyp fallback installed, the build fails outright instead of
# compiling from source; re-add the apt step if that starts happening.
# (Observed once during this change: a transient network timeout failed
# the first build attempt; an immediate retry succeeded cleanly.)
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# seed:full = seed + detect; the dataset anchors to the build date so the
# demo always reads as current. Rebuilding refreshes the data window.
RUN npm run seed:full && npm run build

FROM node:22-bookworm-slim AS run
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
