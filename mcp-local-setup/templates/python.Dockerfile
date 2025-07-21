# Python-based MCP server template
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
ARG REQUIREMENTS_FILE=requirements.txt
COPY ${REQUIREMENTS_FILE} .
RUN pip install --no-cache-dir -r ${REQUIREMENTS_FILE}

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app
USER mcpuser

# Default environment
ENV MCP_MODE=http
ENV PORT=3000

EXPOSE ${PORT}

# Default command for MCP server
CMD ["python", "-m", "mcp_server", "--port", "${PORT}"]