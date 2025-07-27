/**
 * Catalog Manager for MCP Server Dashboard
 * Handles UI interactions and API calls for server management
 */

class CatalogManager {
  constructor() {
    this.apiBase = '/api/catalog';
    this.popularServers = [];
    this.installedServers = [];
    this.catalogServers = [];
  }

  async initialize() {
    try {
      await this.loadPopularServers();
      await this.loadInstalledServers();
      await this.loadCatalogServers();
    } catch (error) {
      this.showAlert('Failed to initialize catalog: ' + error.message, 'error');
    }
  }

  /**
   * Load popular servers
   */
  async loadPopularServers() {
    try {
      // For now, use hardcoded popular servers
      // In production, this would fetch from API
      this.popularServers = [
        {
          id: 'snap-happy',
          name: 'Snap Happy',
          description: 'Cross-platform screenshot utility - capture screenshots and list windows',
          npm: '@mariozechner/snap-happy',
          github: 'https://github.com/badlogic/lemmy/tree/main/apps/snap-happy',
          category: 'utility',
          transport: 'stdio'
        },
        {
          id: 'github-mcp',
          name: 'GitHub MCP',
          description: 'Official GitHub integration for repositories, issues, and pull requests',
          npm: '@github/github-mcp-server',
          github: 'https://github.com/github/github-mcp-server',
          category: 'development',
          transport: 'http'
        },
        {
          id: 'notion-mcp',
          name: 'Notion MCP',
          description: 'Official Notion integration for workspace access and management',
          npm: '@makenotion/notion-mcp-server',
          github: 'https://github.com/makenotion/notion-mcp-server',
          category: 'productivity',
          transport: 'http'
        },
        {
          id: 'stripe-mcp',
          name: 'Stripe MCP',
          description: 'Stripe API integration for payment processing and management',
          npm: '@stripe/agent-toolkit',
          github: 'https://github.com/stripe/agent-toolkit',
          category: 'finance',
          transport: 'http'
        },
        {
          id: 'docker-mcp',
          name: 'Docker MCP',
          description: 'Docker container and image management',
          npm: '@docker/mcp-server',
          github: 'https://github.com/docker/mcp-servers',
          category: 'devops',
          transport: 'stdio'
        },
        {
          id: 'supabase-mcp',
          name: 'Supabase MCP',
          description: 'Database, authentication, and edge functions',
          npm: '@supabase/mcp-server',
          github: 'https://github.com/supabase-community/supabase-mcp',
          category: 'database',
          transport: 'http'
        }
      ];

      this.renderPopularServers();
    } catch (error) {
      console.error('Failed to load popular servers:', error);
      throw error;
    }
  }

  /**
   * Load installed servers
   */
  async loadInstalledServers() {
    try {
      // Get API key from localStorage
      const API_KEY = localStorage.getItem('gatewayApiKey') || 'mcp-gateway-default-key';
      
      // Fetch actual servers from API
      const response = await fetch('/api/gateway/servers', {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch servers');
      }
      
      const data = await response.json();
      
      // Map API response to expected format
      this.installedServers = data.servers ? data.servers.map(server => ({
        id: server.id,
        name: server.name || server.id,
        description: `${server.type} server with ${server.toolCount || 0} tools`,
        category: server.source || 'custom',
        transport: server.transport || server.type,
        status: server.status || 'unknown',
        autostart: server.autostart || false
      })) : [];

      this.renderInstalledServers();
    } catch (error) {
      console.error('Failed to load installed servers:', error);
      // Fallback to empty array instead of throwing
      this.installedServers = [];
      this.renderInstalledServers();
    }
  }

  /**
   * Load catalog servers
   */
  async loadCatalogServers() {
    try {
      // Fetch all available servers from the gateway
      const response = await fetch('/api/gateway/catalog', {
        headers: {
          'X-API-Key': 'mcp-gateway-default-key'
        }
      });
      if (response.ok) {
        const data = await response.json();
        const servers = data.catalog || [];
        this.catalogServers = servers.map(server => ({
          id: server.id,
          name: server.name || server.id,
          description: server.description,
          transport: server.transport || 'stdio',
          category: server.category || 'catalog',
          npm: server.package || server.npm,
          github: server.github
        }));
      } else {
        // Fallback to manifest
        const manifestResponse = await fetch('/.well-known/mcp-manifest.json');
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          this.catalogServers = (manifest.servers || []).map(server => ({
            id: server.id,
            name: server.name || server.id,
            description: server.description || 'MCP Server',
            transport: server.transport || 'stdio',
            category: 'catalog'
          }));
        } else {
          this.catalogServers = [];
        }
      }

      this.renderCatalogServers();
    } catch (error) {
      console.error('Failed to load catalog servers:', error);
      this.catalogServers = [];
      this.renderCatalogServers();
    }
  }

  /**
   * Add server from GitHub
   */
  async addFromGitHub() {
    const githubUrl = document.getElementById('github-url').value.trim();
    if (!githubUrl) {
      this.showAlert('Please enter a GitHub URL', 'error');
      return;
    }

    try {
      this.showAlert('Analyzing GitHub repository...', 'info');
      
      // Mock API call - in production, this would call the backend
      const serverInfo = {
        id: githubUrl.split('/').pop().toLowerCase(),
        name: githubUrl.split('/').pop(),
        description: 'MCP server from GitHub',
        github: githubUrl,
        category: 'custom',
        transport: 'stdio'
      };

      this.showAlert(`Successfully added ${serverInfo.name} to catalog!`, 'success');
      document.getElementById('github-url').value = '';
      
      // Reload catalog
      await this.loadCatalogServers();
    } catch (error) {
      this.showAlert('Failed to add from GitHub: ' + error.message, 'error');
    }
  }

  /**
   * Add server from NPM
   */
  async addFromNpm() {
    const npmPackage = document.getElementById('npm-package').value.trim();
    if (!npmPackage) {
      this.showAlert('Please enter an NPM package name', 'error');
      return;
    }

    try {
      this.showAlert('Checking NPM package...', 'info');
      
      // Mock API call - in production, this would call the backend
      const serverInfo = {
        id: npmPackage.replace(/[@\/]/g, '-'),
        name: npmPackage,
        description: 'MCP server from NPM',
        npm: npmPackage,
        category: 'custom',
        transport: 'stdio'
      };

      this.showAlert(`Successfully added ${serverInfo.name} to catalog!`, 'success');
      document.getElementById('npm-package').value = '';
      
      // Reload catalog
      await this.loadCatalogServers();
    } catch (error) {
      this.showAlert('Failed to add from NPM: ' + error.message, 'error');
    }
  }

  /**
   * Install a server
   */
  async installServer(serverId) {
    try {
      const button = document.querySelector(`[data-server-id="${serverId}"] .btn-install`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Installing...';
      }

      this.showAlert(`Installing ${serverId}...`, 'info');
      
      // Mock installation - in production, call backend API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      this.showAlert(`Successfully installed ${serverId}!`, 'success');
      
      // Move to installed servers
      const server = this.popularServers.find(s => s.id === serverId) || 
                    this.catalogServers.find(s => s.id === serverId);
      if (server) {
        this.installedServers.push({
          ...server,
          status: 'stopped'
        });
        this.renderInstalledServers();
      }

      // Update button
      if (button) {
        button.disabled = false;
        button.textContent = 'Installed';
        button.className = 'btn btn-secondary';
      }
    } catch (error) {
      this.showAlert('Failed to install server: ' + error.message, 'error');
    }
  }

  /**
   * Start a server
   */
  async startServer(serverId) {
    try {
      this.showAlert(`Starting ${serverId}...`, 'info');
      
      // Mock start - in production, call backend API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update server status
      const server = this.installedServers.find(s => s.id === serverId);
      if (server) {
        server.status = 'running';
        this.renderInstalledServers();
      }
      
      this.showAlert(`Successfully started ${serverId}!`, 'success');
    } catch (error) {
      this.showAlert('Failed to start server: ' + error.message, 'error');
    }
  }

  /**
   * Stop a server
   */
  async stopServer(serverId) {
    try {
      this.showAlert(`Stopping ${serverId}...`, 'info');
      
      // Mock stop - in production, call backend API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update server status
      const server = this.installedServers.find(s => s.id === serverId);
      if (server) {
        server.status = 'stopped';
        this.renderInstalledServers();
      }
      
      this.showAlert(`Successfully stopped ${serverId}!`, 'success');
    } catch (error) {
      this.showAlert('Failed to stop server: ' + error.message, 'error');
    }
  }

  /**
   * Render popular servers
   */
  renderPopularServers() {
    const container = document.getElementById('popular-servers');
    container.innerHTML = this.popularServers.map(server => this.createServerCard(server, 'popular')).join('');
  }

  /**
   * Render installed servers
   */
  renderInstalledServers() {
    const container = document.getElementById('installed-servers');
    if (this.installedServers.length === 0) {
      container.innerHTML = '<div class="loading">No servers installed yet</div>';
    } else {
      container.innerHTML = this.installedServers.map(server => this.createServerCard(server, 'installed')).join('');
    }
  }

  /**
   * Render catalog servers
   */
  renderCatalogServers() {
    const container = document.getElementById('available-servers');
    if (this.catalogServers.length === 0) {
      container.innerHTML = '<div class="loading">No additional servers in catalog</div>';
    } else {
      container.innerHTML = this.catalogServers.map(server => this.createServerCard(server, 'catalog')).join('');
    }
  }

  /**
   * Create server card HTML
   */
  createServerCard(server, type) {
    const isInstalled = this.installedServers.some(s => s.id === server.id);
    
    let actions = '';
    if (type === 'installed') {
      const statusClass = server.status === 'running' ? 'status-running' : 'status-stopped';
      const statusText = server.status === 'running' ? 'Running' : 'Stopped';
      const isAutoStart = server.autostart || false;
      
      actions = `
        <div style="margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label class="toggle-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" 
                     class="auto-start-toggle" 
                     id="autostart-${server.id}"
                     data-server-id="${server.id}"
                     ${isAutoStart ? 'checked' : ''}
                     onchange="catalogManager.toggleAutoStart('${server.id}', this.checked)"
                     style="display: none;">
              <span class="toggle-slider" style="display: inline-block; width: 40px; height: 22px; background: ${isAutoStart ? 'var(--primary)' : 'var(--gray-400)'}; border-radius: 11px; position: relative; transition: background 0.3s; cursor: pointer;">
                <span style="position: absolute; top: 2px; ${isAutoStart ? 'right: 2px' : 'left: 2px'}; width: 18px; height: 18px; background: white; border-radius: 50%; transition: all 0.3s;"></span>
              </span>
              <span style="font-size: 14px; color: var(--gray-600);">Auto-start</span>
              ${isAutoStart ? '<span style="font-size: 12px; color: var(--warning);">⭐</span>' : ''}
            </label>
          </div>
          <div>
            <span class="status-indicator ${statusClass}"></span>
            <span style="font-size: 14px;">${statusText}</span>
          </div>
        </div>
        <div style="margin-top: 0.5rem;">
          ${server.status === 'running' 
            ? `<button class="btn btn-danger" onclick="stopServer('${server.id}')">Stop</button>`
            : `<button class="btn btn-success" onclick="startServer('${server.id}')">Start</button>`
          }
          <button class="btn btn-secondary" onclick="configureServer('${server.id}')">Configure</button>
        </div>
      `;
    } else if (!isInstalled) {
      actions = `
        <button class="btn btn-primary btn-install" onclick="installServer('${server.id}')" data-server-id="${server.id}">
          Install
        </button>
      `;
    } else {
      actions = `<button class="btn btn-secondary" disabled>Installed</button>`;
    }

    const badges = `
      ${server.category ? `<span class="badge badge-category">${server.category}</span>` : ''}
      ${server.transport ? `<span class="badge badge-transport">${server.transport}</span>` : ''}
    `;

    const meta = [];
    if (server.npm) meta.push(`npm: ${server.npm}`);
    if (server.github) meta.push(`<a href="${server.github}" target="_blank">GitHub</a>`);

    return `
      <div class="server-card" data-server-id="${server.id}">
        <div class="server-name">${server.name}</div>
        <div class="server-description">${server.description || 'No description available'}</div>
        <div class="server-meta">
          ${badges}
        </div>
        ${meta.length > 0 ? `<div class="server-meta">${meta.join(' • ')}</div>` : ''}
        ${actions}
      </div>
    `;
  }

  /**
   * Show alert message
   */
  showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alerts');
    const alertId = 'alert-' + Date.now();
    
    const alert = document.createElement('div');
    alert.id = alertId;
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertContainer.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      const el = document.getElementById(alertId);
      if (el) el.remove();
    }, 5000);
  }

  /**
   * Toggle auto-start for a server
   */
  async toggleAutoStart(serverId, enabled) {
    try {
      const API_KEY = localStorage.getItem('gatewayApiKey') || 'mcp-gateway-default-key';
      
      const response = await fetch(`/api/gateway/servers/${serverId}/autostart`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ enabled })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update auto-start setting');
      }
      
      const data = await response.json();
      this.showAlert(data.message, 'success');
      
      // Update local state
      const server = this.installedServers.find(s => s.id === serverId);
      if (server) {
        server.autostart = enabled;
      }
      
      // Update toggle visual state
      const toggle = document.getElementById(`autostart-${serverId}`);
      if (toggle) {
        const slider = toggle.nextElementSibling;
        if (slider) {
          slider.style.background = enabled ? 'var(--primary)' : 'var(--gray-400)';
          const dot = slider.firstElementChild;
          if (dot) {
            dot.style.left = enabled ? '' : '2px';
            dot.style.right = enabled ? '2px' : '';
          }
        }
      }
    } catch (error) {
      console.error('Failed to toggle auto-start:', error);
      this.showAlert('Failed to update auto-start setting', 'error');
      
      // Revert checkbox state
      const toggle = document.getElementById(`autostart-${serverId}`);
      if (toggle) {
        toggle.checked = !enabled;
      }
    }
  }

  /**
   * Configure server (placeholder)
   */
  configureServer(serverId) {
    this.showAlert(`Configuration for ${serverId} coming soon!`, 'info');
  }

  /**
   * Uninstall server (placeholder)
   */
  uninstallServer(serverId) {
    this.showAlert(`Uninstall functionality coming soon!`, 'info');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CatalogManager;
}