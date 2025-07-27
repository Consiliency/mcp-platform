# Python pip-based MCP server template
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the package from pip
ARG PACKAGE
RUN pip install --no-cache-dir ${PACKAGE}

# Create non-root user
RUN useradd -m -u 1001 mcpuser
USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# For pip packages, we need to determine the entry point
# Most MCP servers follow a pattern like 'python -m package_name' or have a CLI command
# This will be overridden in docker-compose.yml based on the specific package
CMD ["python", "-m", "mcp"]