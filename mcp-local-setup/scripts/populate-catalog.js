#!/usr/bin/env node

/**
 * Populate Catalog Script
 * Adds popular MCP servers to the catalog
 */

const fs = require('fs').promises;
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '../registry/mcp-catalog.json');

const popularServers = [
  {
    id: 'snap-happy',
    name: 'Snap Happy',
    description: 'Cross-platform screenshot utility - capture screenshots and list windows',
    category: 'utility',
    source: {
      type: 'npm',
      package: '@mariozechner/snap-happy',
      version: 'latest'
    },
    docker: {
      build: {
        dockerfile: 'templates/npm.Dockerfile',
        args: {
          PACKAGE: '@mariozechner/snap-happy'
        }
      }
    },
    config: {
      port: 3010,
      environment: {
        MCP_MODE: 'stdio'
      }
    },
    transport: 'stdio',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/badlogic/lemmy/tree/main/apps/snap-happy'
  },
  {
    id: 'github-mcp',
    name: 'GitHub MCP',
    description: 'Official GitHub integration for repositories, issues, and pull requests',
    category: 'development',
    source: {
      type: 'github',
      url: 'https://github.com/github/github-mcp-server'
    },
    docker: {
      build: {
        context: 'https://github.com/github/github-mcp-server.git',
        dockerfile: 'Dockerfile'
      }
    },
    config: {
      port: 3011,
      environment: {
        MCP_MODE: 'http',
        GITHUB_TOKEN: '${GITHUB_TOKEN}'
      },
      env_required: ['GITHUB_TOKEN']
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/github/github-mcp-server'
  },
  {
    id: 'fetch-mcp',
    name: 'Fetch MCP',
    description: 'Web content fetching and conversion optimized for LLM usage',
    category: 'utility',
    source: {
      type: 'npm',
      package: '@modelcontextprotocol/server-fetch',
      version: 'latest'
    },
    docker: {
      build: {
        dockerfile: 'templates/npm.Dockerfile',
        args: {
          PACKAGE: '@modelcontextprotocol/server-fetch'
        }
      }
    },
    config: {
      port: 3012,
      environment: {
        MCP_MODE: 'http'
      }
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor']
  },
  {
    id: 'memory-mcp',
    name: 'Memory MCP',
    description: 'Simple knowledge graph memory for storing and retrieving information',
    category: 'ai-ml',
    source: {
      type: 'npm',
      package: '@modelcontextprotocol/server-memory',
      version: 'latest'
    },
    docker: {
      build: {
        dockerfile: 'templates/npm.Dockerfile',
        args: {
          PACKAGE: '@modelcontextprotocol/server-memory'
        }
      }
    },
    config: {
      port: 3013,
      environment: {
        MCP_MODE: 'http'
      },
      volumes: [
        'memory-data:/data'
      ]
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor']
  },
  {
    id: 'docker-mcp',
    name: 'Docker MCP',
    description: 'Manage Docker containers, images, and compose stacks',
    category: 'devops',
    source: {
      type: 'github',
      url: 'https://github.com/docker/mcp-servers'
    },
    docker: {
      build: {
        context: 'https://github.com/docker/mcp-servers.git',
        dockerfile: 'Dockerfile'
      }
    },
    config: {
      port: 3014,
      environment: {
        MCP_MODE: 'stdio'
      },
      volumes: [
        '/var/run/docker.sock:/var/run/docker.sock'
      ]
    },
    transport: 'stdio',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/docker/mcp-servers'
  },
  {
    id: 'stripe-mcp',
    name: 'Stripe MCP',
    description: 'Interact with Stripe API for payment processing and management',
    category: 'finance',
    source: {
      type: 'github',
      url: 'https://github.com/stripe/agent-toolkit'
    },
    docker: {
      build: {
        context: 'https://github.com/stripe/agent-toolkit.git',
        dockerfile: 'Dockerfile'
      }
    },
    config: {
      port: 3015,
      environment: {
        MCP_MODE: 'http',
        STRIPE_API_KEY: '${STRIPE_API_KEY}'
      },
      env_required: ['STRIPE_API_KEY']
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/stripe/agent-toolkit'
  },
  {
    id: 'notion-mcp',
    name: 'Notion MCP',
    description: 'Official Notion integration for workspace access and management',
    category: 'productivity',
    source: {
      type: 'github',
      url: 'https://github.com/makenotion/notion-mcp-server'
    },
    docker: {
      build: {
        context: 'https://github.com/makenotion/notion-mcp-server.git',
        dockerfile: 'Dockerfile'
      }
    },
    config: {
      port: 3016,
      environment: {
        MCP_MODE: 'http',
        NOTION_TOKEN: '${NOTION_TOKEN}'
      },
      env_required: ['NOTION_TOKEN']
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/makenotion/notion-mcp-server'
  },
  {
    id: 'supabase-mcp',
    name: 'Supabase MCP',
    description: 'Connect to Supabase for database, auth, and edge functions',
    category: 'database',
    source: {
      type: 'github',
      url: 'https://github.com/supabase-community/supabase-mcp'
    },
    docker: {
      build: {
        context: 'https://github.com/supabase-community/supabase-mcp.git',
        dockerfile: 'Dockerfile'
      }
    },
    config: {
      port: 3017,
      environment: {
        MCP_MODE: 'http',
        SUPABASE_URL: '${SUPABASE_URL}',
        SUPABASE_KEY: '${SUPABASE_KEY}'
      },
      env_required: ['SUPABASE_URL', 'SUPABASE_KEY']
    },
    transport: 'http',
    clients: ['claude-code', 'vs-code', 'cursor'],
    repository: 'https://github.com/supabase-community/supabase-mcp'
  }
];

async function populateCatalog() {
  try {
    // Load existing catalog
    let catalog;
    try {
      const data = await fs.readFile(CATALOG_PATH, 'utf-8');
      catalog = JSON.parse(data);
    } catch (error) {
      console.log('Creating new catalog...');
      catalog = {
        version: '1.0',
        updated: new Date().toISOString().split('T')[0],
        categories: {
          development: {
            name: 'Development Tools',
            description: 'Tools for software development and coding'
          },
          data: {
            name: 'Data Access',
            description: 'Tools for accessing and managing data'
          },
          'ai-ml': {
            name: 'AI/ML Tools',
            description: 'Machine learning and AI-related tools'
          },
          cloud: {
            name: 'Cloud Services',
            description: 'Cloud platform integrations'
          },
          custom: {
            name: 'Custom Tools',
            description: 'User-created custom MCP servers'
          },
          utility: {
            name: 'Utility Tools',
            description: 'General purpose utility servers'
          },
          productivity: {
            name: 'Productivity',
            description: 'Tools for productivity and workflow'
          },
          finance: {
            name: 'Finance',
            description: 'Financial and payment processing tools'
          },
          devops: {
            name: 'DevOps',
            description: 'DevOps and infrastructure tools'
          },
          database: {
            name: 'Database',
            description: 'Database and data storage tools'
          }
        },
        servers: []
      };
    }

    // Add or update popular servers
    for (const server of popularServers) {
      const existingIndex = catalog.servers.findIndex(s => s.id === server.id);
      if (existingIndex >= 0) {
        // Update existing server
        catalog.servers[existingIndex] = {
          ...catalog.servers[existingIndex],
          ...server
        };
        console.log(`Updated: ${server.name}`);
      } else {
        // Add new server
        catalog.servers.push(server);
        console.log(`Added: ${server.name}`);
      }
    }

    // Sort servers by category and name
    catalog.servers.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    // Update timestamp
    catalog.updated = new Date().toISOString().split('T')[0];

    // Save catalog
    await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2));
    console.log('\nCatalog updated successfully!');
    console.log(`Total servers: ${catalog.servers.length}`);

  } catch (error) {
    console.error('Error populating catalog:', error);
    process.exit(1);
  }
}

// Run the script
populateCatalog();