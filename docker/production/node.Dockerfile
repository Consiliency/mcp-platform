# Multi-stage production Node.js Dockerfile with security optimizations
# Stage 1: Dependencies
FROM node:20-alpine AS dependencies
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Run build if applicable
RUN if [ -f "tsconfig.json" ]; then npm run build; fi

# Stage 3: Security scan
FROM node:20-alpine AS security-scan
WORKDIR /app

# Install security scanning tools
RUN npm install -g npm-audit-resolver snyk

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./

# Run security audit
RUN npm audit --production || true && \
    if [ -n "$SNYK_TOKEN" ]; then snyk test --severity-threshold=high || true; fi

# Stage 4: Production
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built application
# Note: Use separate RUN commands to handle optional directories
COPY --from=build /app/src ./src
RUN mkdir -p dist lib || true

# Copy health check script
COPY docker/health/health-monitor.js ./health/

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (adjust as needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node /app/health/health-monitor.js --check liveness || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "src/index.js"]