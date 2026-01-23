# Base stage
# Use a Debian-based image instead of Alpine to avoid QEMU issues when building multi-arch images
FROM node:20-slim AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user (Debian-based image)
# `node:20-slim` is Debian, so we use `groupadd`/`useradd` instead of Alpine's `addgroup`/`adduser` flags.
RUN groupadd -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs nodejs \
    && mkdir -p /home/nodejs \
    && chown -R nodejs:nodejs /home/nodejs /app

USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Development stage
FROM base AS development
USER root
RUN npm ci && npm cache clean --force
USER nodejs
CMD ["npm", "run", "dev"]

# Production stage
FROM base AS production
CMD ["npm", "start"]
