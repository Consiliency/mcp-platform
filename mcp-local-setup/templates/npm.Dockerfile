# Generic Dockerfile for NPM-based MCP servers
ARG PACKAGE

FROM node:20-alpine AS base

# Install dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install the MCP package globally
ARG PACKAGE
RUN npm install -g ${PACKAGE}

# Create a simple wrapper script for HTTP mode
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'PACKAGE_NAME=$(echo $PACKAGE | cut -d"/" -f2 | cut -d"@" -f1)' >> /app/start.sh && \
    echo 'if [ "$MCP_MODE" = "http" ]; then' >> /app/start.sh && \
    echo '  npx ${PACKAGE} --port ${PORT:-3000}' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  npx ${PACKAGE}' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

# Run as non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -u 1001 -G mcpuser mcpuser && \
    chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment variables
ENV MCP_MODE=http
ENV PORT=3000
ENV PACKAGE=${PACKAGE}

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]