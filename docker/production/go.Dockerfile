# Go Service Dockerfile
# TODO: Implement production Go service container
# 
# @assigned-to Docker Production Team
# 
# Requirements:
# - Multi-stage build for minimal image size
# - Non-root user execution
# - Health check endpoint
# - Graceful shutdown support
# - Security scanning compliance

# TODO: Build stage
FROM golang:1.21-alpine AS builder

# TODO: Install dependencies
RUN apk add --no-cache git ca-certificates

# TODO: Set working directory
WORKDIR /app

# TODO: Copy go mod files and download dependencies
# COPY go.mod go.sum ./
# RUN go mod download

# TODO: Copy source code
# COPY . .

# TODO: Build the application
# RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# TODO: Final stage
FROM scratch

# TODO: Copy from builder
# COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
# COPY --from=builder /app/main /main

# TODO: Create non-root user
# USER 1000

# TODO: Expose port
EXPOSE 8080

# TODO: Set entrypoint
# ENTRYPOINT ["/main"]