# Multi-stage build for Ops Center API

FROM node:20-alpine AS builder
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Ensure the non-root 'node' user owns the app directory, then switch to it
RUN chown -R node:node /app
USER node

# Env defaults (override via compose)
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["node", "-r", "module-alias/register", "dist/app.js"]


