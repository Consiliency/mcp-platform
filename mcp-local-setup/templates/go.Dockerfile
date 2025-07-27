# Go module-based MCP server template
FROM golang:1.21-alpine as builder

# Install dependencies
RUN apk add --no-cache git

WORKDIR /app

# Install the Go module
ARG PACKAGE
RUN go install ${PACKAGE}@latest

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

# Copy the binary from builder
# Extract the binary name from the package path
ARG PACKAGE
RUN echo ${PACKAGE} | awk -F'/' '{print $NF}' > /tmp/binary_name
COPY --from=builder /go/bin/* /usr/local/bin/

# Create non-root user
RUN adduser -D -u 1001 mcpuser
USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# The command will be determined from the package name
CMD ["/bin/sh", "-c", "/usr/local/bin/$(cat /tmp/binary_name)"]