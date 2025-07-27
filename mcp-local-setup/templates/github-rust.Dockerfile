# Rust GitHub source MCP server template
FROM rust:1.77-slim AS builder

# Install git and build dependencies
RUN apt-get update && apt-get install -y \
    git \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Check for Cargo.toml
RUN if [ ! -f "Cargo.toml" ]; then \
      echo "Error: Cargo.toml not found in repository"; \
      exit 1; \
    fi

# Build the application in release mode
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
# Try to find the binary name from Cargo.toml
COPY --from=builder /app/target/release/* /app/

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

# Create startup script to find the correct binary
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Find the executable binary' >> /app/start.sh && \
    echo 'for file in /app/*; do' >> /app/start.sh && \
    echo '  if [ -x "$file" ] && [ -f "$file" ] && [ ! "$file" = "/app/start.sh" ]; then' >> /app/start.sh && \
    echo '    # Check if its a binary (not a script)' >> /app/start.sh && \
    echo '    if file "$file" | grep -q "ELF"; then' >> /app/start.sh && \
    echo '      echo "Starting MCP server: $file"' >> /app/start.sh && \
    echo '      exec "$file"' >> /app/start.sh && \
    echo '    fi' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'done' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "Error: No executable binary found"' >> /app/start.sh && \
    echo 'exit 1' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]