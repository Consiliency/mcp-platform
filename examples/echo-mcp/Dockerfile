FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S -u 1001 -G mcpuser mcpuser && \
    chown -R mcpuser:mcpuser /app

USER mcpuser

# Default to stdio transport
CMD ["node", "index.js"]