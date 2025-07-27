# Rust Cargo-based MCP server template
FROM rust:1.77-slim as builder

# Install dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the crate from crates.io
ARG PACKAGE
RUN cargo install ${PACKAGE}

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
ARG PACKAGE
COPY --from=builder /usr/local/cargo/bin/${PACKAGE} /usr/local/bin/${PACKAGE}

# Create non-root user
RUN useradd -m -u 1001 mcpuser
USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# The command will be the package name by default
ARG PACKAGE
ENV PACKAGE=${PACKAGE}
CMD ["/bin/sh", "-c", "/usr/local/bin/${PACKAGE}"]