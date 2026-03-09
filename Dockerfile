# ─────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ─────────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S habeshahub -u 1001

WORKDIR /app

# Copy production artifacts from builder
COPY --from=builder --chown=habeshahub:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=habeshahub:nodejs /app/dist ./dist
COPY --from=builder --chown=habeshahub:nodejs /app/prisma ./prisma
COPY --from=builder --chown=habeshahub:nodejs /app/package.json ./

# Switch to non-root user
USER habeshahub

EXPOSE 3000

# Use dumb-init as entrypoint to handle signals
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
