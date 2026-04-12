# ComplianceGuard Frontend Dockerfile
# React + TypeScript + Vite

# ----------------------
# Build stage
# ----------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy entire project (prevents missing index.html / tsconfig issues)
COPY . .

# Install dependencies
RUN npm ci --legacy-peer-deps

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