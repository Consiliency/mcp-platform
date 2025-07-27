# Go GitHub source MCP server template
FROM golang:1.21-alpine AS builder

# Install git
RUN apk add --no-cache git

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Check for go.mod
RUN if [ ! -f "go.mod" ]; then \
      echo "Error: go.mod not found in repository"; \
      exit 1; \
    fi

# Download dependencies
RUN go mod download

# Build the application
RUN go build -o mcp-server .

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy the binary
COPY --from=builder /app/mcp-server /app/mcp-server

# Create non-root user
RUN adduser -D -u 1001 mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# Run the MCP server
CMD ["/app/mcp-server"]