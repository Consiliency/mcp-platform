# PHP Composer-based MCP server template
FROM php:8.2-cli

# Install system dependencies and Composer
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libzip-dev \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Create a basic composer.json for the package
ARG PACKAGE
RUN composer init --no-interaction --name="mcp/server" --type="project" && \
    composer require ${PACKAGE} --no-interaction

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app
USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# For PHP packages, we typically need a bootstrap script
# This will be overridden in docker-compose.yml based on the specific package
CMD ["php", "vendor/bin/mcp-server"]