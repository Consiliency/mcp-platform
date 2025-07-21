# Custom MCP server template - flexible multi-stage build
ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE} AS base

WORKDIR /app

# Build stage - customize based on your needs
FROM base AS builder
# Add your build steps here
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build

# Runtime stage
FROM base AS runtime

# Create non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -u 1001 -G mcpuser mcpuser

# Copy built application (customize path)
# COPY --from=builder --chown=mcpuser:mcpuser /app/dist /app

# Switch to non-root user
USER mcpuser

# Environment
ENV MCP_MODE=http
ENV PORT=3000

EXPOSE ${PORT}

# Set your custom entrypoint
# ENTRYPOINT ["node", "server.js"]
CMD ["echo", "Please customize this Dockerfile for your MCP server"]