# Ruby Gem-based MCP server template
FROM ruby:3.2-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the gem from RubyGems
ARG PACKAGE
RUN gem install ${PACKAGE}

# Create non-root user
RUN useradd -m -u 1001 mcpuser
USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

EXPOSE ${PORT}

# For Ruby gems, the command varies by package
# This will be overridden in docker-compose.yml based on the specific gem
ARG PACKAGE
ENV PACKAGE=${PACKAGE}
CMD ["ruby", "-e", "require '${PACKAGE}'; ${PACKAGE.upcase}.run"]