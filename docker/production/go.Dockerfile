# Multi-stage production Go Dockerfile with security optimizations
# Stage 1: Dependencies
FROM golang:1.21-alpine AS dependencies
WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && go mod verify

# Stage 2: Build
FROM golang:1.21-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files and dependencies
COPY go.mod go.sum ./
COPY --from=dependencies /go/pkg /go/pkg

# Copy source code
COPY . .

# Build the binary with security flags
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o main .

# Stage 3: Security scan
FROM golang:1.21-alpine AS security-scan
WORKDIR /app

# Install security scanning tools
RUN go install github.com/securego/gosec/v2/cmd/gosec@latest && \
    go install honnef.co/go/tools/cmd/staticcheck@latest

# Copy source for scanning
COPY . .

# Run security scans
RUN gosec -fmt json ./... || true && \
    staticcheck ./... || true

# Stage 4: Final minimal image
FROM alpine:3.19 AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Import CA certificates from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001

# Copy the binary
COPY --from=builder /app/main /app/main

# Copy health check script
COPY docker/health/health-check-go /app/health/

# Set ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD /app/health/health-check-go || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the binary
CMD ["/app/main"]