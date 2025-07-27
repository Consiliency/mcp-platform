# Python GitHub source MCP server template
FROM python:3.11-slim AS builder

# Install git and build dependencies
RUN apt-get update && apt-get install -y \
    git \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Check for Python project files
RUN if [ ! -f "requirements.txt" ] && [ ! -f "setup.py" ] && [ ! -f "pyproject.toml" ]; then \
      echo "Error: No Python project files found (requirements.txt, setup.py, or pyproject.toml)"; \
      exit 1; \
    fi

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
RUN if [ -f "requirements.txt" ]; then \
      pip install --no-cache-dir -r requirements.txt; \
    elif [ -f "setup.py" ]; then \
      pip install --no-cache-dir -e .; \
    elif [ -f "pyproject.toml" ]; then \
      pip install --no-cache-dir .; \
    fi

# Runtime stage
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv

# Copy application
COPY --from=builder /app /app

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser

# Activate virtual environment
ENV PATH="/opt/venv/bin:$PATH"

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

# Create startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Common Python MCP server patterns' >> /app/start.sh && \
    echo 'if [ -f "src/mcp_server.py" ]; then' >> /app/start.sh && \
    echo '  exec python src/mcp_server.py' >> /app/start.sh && \
    echo 'elif [ -f "mcp_server.py" ]; then' >> /app/start.sh && \
    echo '  exec python mcp_server.py' >> /app/start.sh && \
    echo 'elif [ -f "server.py" ]; then' >> /app/start.sh && \
    echo '  exec python server.py' >> /app/start.sh && \
    echo 'elif [ -f "main.py" ]; then' >> /app/start.sh && \
    echo '  exec python main.py' >> /app/start.sh && \
    echo 'elif [ -f "app.py" ]; then' >> /app/start.sh && \
    echo '  exec python app.py' >> /app/start.sh && \
    echo 'elif [ -f "__main__.py" ]; then' >> /app/start.sh && \
    echo '  exec python __main__.py' >> /app/start.sh && \
    echo 'elif [ -f "src/__main__.py" ]; then' >> /app/start.sh && \
    echo '  exec python -m src' >> /app/start.sh && \
    echo 'elif [ -f "setup.py" ]; then' >> /app/start.sh && \
    echo '  # Try to run as module using package name' >> /app/start.sh && \
    echo '  PKG_NAME=$(python -c "import re; setup=open(\"setup.py\").read(); m=re.search(r\"name\\s*=\\s*[\\\"\\x27]([^\\\"\\x27]+)\", setup); print(m.group(1) if m else \"\")")' >> /app/start.sh && \
    echo '  if [ -n "$PKG_NAME" ]; then' >> /app/start.sh && \
    echo '    exec python -m $PKG_NAME' >> /app/start.sh && \
    echo '  fi' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo 'echo "Error: No Python entry point found"' >> /app/start.sh && \
    echo 'echo "Searched for: mcp_server.py, server.py, main.py, app.py, __main__.py"' >> /app/start.sh && \
    echo 'exit 1' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]