# Ruby GitHub source MCP server template
FROM ruby:3.2-slim

# Install git and build dependencies
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone the repository
ARG GITHUB_URL
RUN git clone ${GITHUB_URL} . || (echo "Failed to clone repository" && exit 1)

# Check for Ruby project files
RUN if [ ! -f "Gemfile" ] && [ ! -f "*.gemspec" ]; then \
      echo "Error: No Ruby project files found (Gemfile or .gemspec)"; \
      exit 1; \
    fi

# Install bundler
RUN gem install bundler

# Install dependencies
RUN if [ -f "Gemfile" ]; then \
      bundle install; \
    fi

# Create non-root user
RUN useradd -m -u 1001 mcpuser && chown -R mcpuser:mcpuser /app

USER mcpuser

# Default environment
ENV MCP_MODE=stdio
ENV PORT=3000

# Create startup script
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo '' >> /app/start.sh && \
    echo '# Common Ruby MCP server patterns' >> /app/start.sh && \
    echo 'if [ -f "bin/mcp-server" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec bin/mcp-server' >> /app/start.sh && \
    echo 'elif [ -f "exe/mcp-server" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec exe/mcp-server' >> /app/start.sh && \
    echo 'elif [ -f "server.rb" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec ruby server.rb' >> /app/start.sh && \
    echo 'elif [ -f "main.rb" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec ruby main.rb' >> /app/start.sh && \
    echo 'elif [ -f "app.rb" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec ruby app.rb' >> /app/start.sh && \
    echo 'elif [ -f "lib/server.rb" ]; then' >> /app/start.sh && \
    echo '  exec bundle exec ruby lib/server.rb' >> /app/start.sh && \
    echo 'elif [ -f "Rakefile" ]; then' >> /app/start.sh && \
    echo '  # Check if there is a default rake task' >> /app/start.sh && \
    echo '  exec bundle exec rake' >> /app/start.sh && \
    echo 'else' >> /app/start.sh && \
    echo '  echo "Error: No Ruby entry point found"' >> /app/start.sh && \
    echo '  echo "Searched for: bin/mcp-server, server.rb, main.rb, app.rb"' >> /app/start.sh && \
    echo '  exit 1' >> /app/start.sh && \
    echo 'fi' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE ${PORT}

ENTRYPOINT ["/app/start.sh"]