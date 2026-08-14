# ComplianceGuard Frontend Dockerfile
# React + TypeScript + Vite
#
# Build context: repo root (docker-compose build context: .) so that
# shared/constants.json — the cross-repo single source of truth imported by
# src/constants.ts — is available to the Vite build.

# ----------------------
# Build stage
# ----------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source + shared constants
COPY frontend/ ./
COPY shared/ ./shared/

# Build app
RUN npm run build


# ----------------------
# Production stage
# ----------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install static server
RUN npm install -g serve

# Copy build output only
COPY --from=builder /app/dist ./dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run app
CMD ["serve", "-s", "dist", "-l", "3000"]
