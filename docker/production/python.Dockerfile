# Multi-stage production Python Dockerfile with security optimizations
# Stage 1: Builder
FROM python:3.11-slim AS builder
WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Security scan
FROM python:3.11-slim AS security-scan
WORKDIR /app

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install security scanning tools
RUN pip install --no-cache-dir safety bandit

# Copy source for scanning
COPY . .

# Run security scans
RUN safety check --json || true && \
    bandit -r . -f json || true

# Stage 3: Production
FROM python:3.11-slim AS production

# Install runtime dependencies and dumb-init
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r python -g 1001 && \
    useradd -r -g python -u 1001 -d /app -s /sbin/nologin python

# Set working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Enable virtual environment
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy application code
COPY --chown=python:python . .

# Copy health check script
COPY --chown=python:python docker/health/health-monitor.py ./health/

# Switch to non-root user
USER python

# Expose port (adjust as needed)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python /app/health/health-monitor.py --check liveness || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["python", "-m", "app"]