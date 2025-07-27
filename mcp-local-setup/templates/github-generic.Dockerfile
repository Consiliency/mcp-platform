# Generic GitHub source MCP server template
# Used as fallback when language cannot be determined
FROM alpine:3.19 AS builder

# Install git and common build tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    wget \
    make \
    gcc \
    g++ \
    musl-dev \
    python3 \
    py3-pip \
    nodejs \
    npm

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Try to detect and build based on common patterns
RUN echo '#!/bin/bash' > /app/build.sh && \
    echo 'set -e' >> /app/build.sh && \
    echo '' >> /app/build.sh && \
    echo '# Try different build approaches' >> /app/build.sh && \
    echo 'if [ -f "Makefile" ]; then' >> /app/build.sh && \
    echo '  echo "Found Makefile, running make..."' >> /app/build.sh && \
    echo '  make' >> /app/build.sh && \
    echo 'elif [ -f "build.sh" ]; then' >> /app/build.sh && \
    echo '  echo "Found build.sh, executing..."' >> /app/build.sh && \
    echo '  chmod +x build.sh && ./build.sh' >> /app/build.sh && \
    echo 'elif [ -f "install.sh" ]; then' >> /app/build.sh && \
    echo '  echo "Found install.sh, executing..."' >> /app/build.sh && \
    echo '  chmod +x install.sh && ./install.sh' >> /app/build.sh && \
    echo 'else' >> /app/build.sh && \
    echo '  echo "No build script found, assuming project is ready to run"' >> /app/build.sh && \
    echo 'fi' >> /app/build.sh && \
    chmod +x /app/build.sh && \
    /app/build.sh

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies for multiple languages
RUN apk add --no-cache \
    bash \
    ca-certificates \
    python3 \
    nodejs \
    libstdc++ \
    libgcc

WORKDIR /app

# Copy everything from builder
COPY --from=builder /app /app

# Create non-root user
RUN adduser -D -u 1001 mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

# Create startup script that tries to find the entry point
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Try to find and execute the MCP server' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Check for shell scripts' >> /app/start.sh && \
    echo 'if [ -f "run.sh" ]; then' >> /app/start.sh && \
    echo '  exec bash run.sh' >> /app/start.sh && \
    echo 'elif [ -f "start.sh" ] && [ "$0" != "/app/start.sh" ]; then' >> /app/start.sh && \
    echo '  exec bash start.sh' >> /app/start.sh && \
    echo 'elif [ -f "mcp-server.sh" ]; then' >> /app/start.sh && \
    echo '  exec bash mcp-server.sh' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Check for executables' >> /app/start.sh && \
    echo 'for file in mcp-server mcp_server server main; do' >> /app/start.sh && \
    echo '  if [ -x "$file" ]; then' >> /app/start.sh && \
    echo '    echo "Found executable: $file"' >> /app/start.sh && \
    echo '    exec ./"$file"' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'done' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Check bin directory' >> /app/start.sh && \
    echo 'if [ -d "bin" ]; then' >> /app/start.sh && \
    echo '  for file in bin/*; do' >> /app/start.sh && \
    echo '    if [ -x "$file" ]; then' >> /app/start.sh && \
    echo '      echo "Found executable in bin: $file"' >> /app/start.sh && \
    echo '      exec "$file"' >> /app/start.sh && \
    echo '    fi' >> /app/start.sh && \
    echo '  done' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Try Python files' >> /app/start.sh && \
    echo 'for file in mcp_server.py server.py main.py app.py; do' >> /app/start.sh && \
    echo '  if [ -f "$file" ]; then' >> /app/start.sh && \
    echo '    echo "Found Python file: $file"' >> /app/start.sh && \
    echo '    exec python3 "$file"' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'done' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Try Node.js files' >> /app/start.sh && \
    echo 'for file in server.js main.js index.js app.js; do' >> /app/start.sh && \
    echo '  if [ -f "$file" ]; then' >> /app/start.sh && \
    echo '    echo "Found Node.js file: $file"' >> /app/start.sh && \
    echo '    exec node "$file"' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'done' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "Error: Could not find MCP server entry point"' >> /app/start.sh && \
    echo 'echo "Searched for: run.sh, start.sh, mcp-server, server, main, *.py, *.js"' >> /app/start.sh && \
    echo 'echo "Contents of directory:"' >> /app/start.sh && \
    echo 'ls -la' >> /app/start.sh && \
    echo 'exit 1' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]