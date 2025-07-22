FROM node:20-alpine

WORKDIR /app

# Copy health service
COPY health-service.js package.json ./

# Install dependencies (if any)
RUN npm install --production || true

# Create non-root user
RUN addgroup -g 1001 -S healthcheck && \
    adduser -S -u 1001 -G healthcheck healthcheck

USER healthcheck

# Health check for the health check service itself
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3999/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

EXPOSE 3999

CMD ["node", "health-service.js"]