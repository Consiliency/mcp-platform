# Node.js GitHub source MCP server template
FROM node:20-alpine AS builder

# Install git and build dependencies
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Check for package.json
RUN if [ ! -f "package.json" ]; then \
      echo "Error: package.json not found in repository"; \
      exit 1; \
    fi

# Install dependencies
RUN npm ci || npm install

# Build if build script exists
RUN if npm run | grep -q "build"; then \
      npm run build; \
    fi

# Runtime stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache python3

WORKDIR /app

# Copy built application
COPY --from=builder /app /app

# Create non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -u 1001 -G mcpuser mcpuser && \
    chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

# Detect and set appropriate startup command
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Check for common entry points' >> /app/start.sh && \
    echo 'if [ -f "dist/index.js" ]; then' >> /app/start.sh && \
    echo '  exec node dist/index.js' >> /app/start.sh && \
    echo 'elif [ -f "build/index.js" ]; then' >> /app/start.sh && \
    echo '  exec node build/index.js' >> /app/start.sh && \
    echo 'elif [ -f "lib/index.js" ]; then' >> /app/start.sh && \
    echo '  exec node lib/index.js' >> /app/start.sh && \
    echo 'elif [ -f "src/index.js" ]; then' >> /app/start.sh && \
    echo '  exec node src/index.js' >> /app/start.sh && \
    echo 'elif [ -f "index.js" ]; then' >> /app/start.sh && \
    echo '  exec node index.js' >> /app/start.sh && \
    echo 'elif [ -f "server.js" ]; then' >> /app/start.sh && \
    echo '  exec node server.js' >> /app/start.sh && \
    echo 'elif [ -f "main.js" ]; then' >> /app/start.sh && \
    echo '  exec node main.js' >> /app/start.sh && \
    echo 'elif [ -f "package.json" ]; then' >> /app/start.sh && \
    echo '  # Check for start script' >> /app/start.sh && \
    echo '  if npm run | grep -q "start"; then' >> /app/start.sh && \
    echo '    exec npm start' >> /app/start.sh && \
    echo '  else' >> /app/start.sh && \
    echo '    echo "Error: No start script or known entry point found"' >> /app/start.sh && \
    echo '    exit 1' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "Error: No entry point found"' >> /app/start.sh && \
    echo '  exit 1' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]