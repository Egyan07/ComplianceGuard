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

# Mirror the repo layout (frontend/, shared/, scripts/) so the prebuild hook
# (`node ../scripts/generate-evidence-catalog.mjs`) resolves the canonical
# framework data and writes the generated catalog to the same repo-relative
# paths it does in CI.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

# Copy source + shared constants + the catalog generator script
COPY frontend/ ./frontend/
COPY shared/ ./shared/
COPY scripts/ ./scripts/

# Build app (prebuild regenerates the evidence catalog from canonical data)
RUN cd frontend && npm run build


# ----------------------
# Production stage
# ----------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Install static server
RUN npm install -g serve

# Copy build output only
COPY --from=builder /app/frontend/dist ./dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Run app
CMD ["serve", "-s", "dist", "-l", "3000"]
