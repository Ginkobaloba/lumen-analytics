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
# (ABI 127), so this normally installs from the prebuild, not a compile.
# The toolchain stays anyway as a fallback: a docker build with it removed
# hit a prebuild-install network timeout once (2026-09-19) with nothing to
# fall back to, and failed outright; an immediate retry with no other
# changes built cleanly. Kept here, in the build stage only, so a flaky
# prebuild download degrades to a slower compile instead of a hard build
# failure.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
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
