# syntax=docker/dockerfile:1
# The Hub Up (AbapCrm) — build su GitHub Actions, run su Coolify (ghcr.io/twentivan/abapcrm)

# ---------- stage 1: build ----------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# devDependencies servono al build (vite, esbuild, tsx): niente NODE_ENV=production qui
RUN npm ci
COPY . .
RUN npm run build

# ---------- stage 2: runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# /app/data: loghi caricati (OBJECT_STORAGE_DIR). Montare un volume persistente su /app/data
RUN mkdir -p /app/data/objects && chown -R node:node /app
USER node
EXPOSE 5000
CMD ["node", "dist/index.js"]
