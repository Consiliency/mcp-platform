FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY gateway/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY gateway/ .

# Copy dashboard files
COPY dashboard/ ./dashboard

# Copy catalog files
COPY catalog/ ./catalog

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose the gateway port
EXPOSE 8090

# Set environment to indicate we're running in Docker
ENV RUNNING_IN_DOCKER=true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8090/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the gateway
CMD ["node", "server.js"]