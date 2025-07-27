/**
 * GitHub Repository Parser for MCP Servers
 * Analyzes GitHub repositories to extract MCP server information
 */

const axios = require('axios');
const path = require('path');

class GitHubParser {
  constructor(options = {}) {
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'MCP-Platform'
    };
    
    if (this.githubToken) {
      this.headers['Authorization'] = `token ${this.githubToken}`;
    }
  }

  /**
   * Parse a GitHub repository to extract MCP server information
   */
  async parseRepository(githubUrl) {
    try {
      // Extract owner and repo from URL
      const { owner, repo } = this.parseGitHubUrl(githubUrl);
      
      // Fetch repository information
      const repoInfo = await this.fetchRepoInfo(owner, repo);
      
      // Check for MCP indicators
      const isMcpServer = await this.checkIfMcpServer(owner, repo);
      if (!isMcpServer) {
        throw new Error('Repository does not appear to be an MCP server');
      }
      
      // Extract MCP configuration
      const mcpConfig = await this.extractMcpConfig(owner, repo);
      
      // Extract package information
      const packageInfo = await this.extractPackageInfo(owner, repo);
      
      // Extract installation instructions
      const installInfo = await this.extractInstallInstructions(owner, repo);
      
      // Build server info
      return await this.buildServerInfo({
        owner,
        repo,
        repoInfo,
        mcpConfig,
        packageInfo,
        installInfo
      });
    } catch (error) {
      throw new Error(`Failed to parse GitHub repository: ${error.message}`);
    }
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  parseGitHubUrl(url) {
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\?]+)/,
      /github\.com:([^\/]+)\/([^\.]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        let [, owner, repo] = match;
        // Remove .git suffix if present
        repo = repo.replace(/\.git$/, '');
        return { owner, repo };
      }
    }
    
    throw new Error('Invalid GitHub URL format');
  }

  /**
   * Fetch repository information
   */
  async fetchRepoInfo(owner, repo) {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: this.headers }
    );
    return response.data;
  }

  /**
   * Check if repository is an MCP server
   */
  async checkIfMcpServer(owner, repo) {
    // Check for MCP-related files
    const indicators = [
      'mcp.json',
      'mcp.config.json',
      '.mcp/config.json'
    ];
    
    for (const file of indicators) {
      try {
        await this.fetchFileContent(owner, repo, file);
        return true;
      } catch (error) {
        // File not found, continue checking
      }
    }
    
    // Check package.json for MCP keywords
    try {
      const packageJson = await this.fetchFileContent(owner, repo, 'package.json');
      const pkg = JSON.parse(packageJson);
      
      // Check for MCP indicators in package.json
      if (
        pkg.keywords?.includes('mcp') ||
        pkg.keywords?.includes('model-context-protocol') ||
        pkg.name?.includes('mcp') ||
        pkg.dependencies?.['@modelcontextprotocol/sdk'] ||
        pkg.devDependencies?.['@modelcontextprotocol/sdk']
      ) {
        return true;
      }
    } catch (error) {
      // No package.json or parsing error
    }
    
    // Check README for MCP mentions
    try {
      const readme = await this.fetchReadme(owner, repo);
      const lowerReadme = readme.toLowerCase();
      return lowerReadme.includes('model context protocol') || 
             lowerReadme.includes('mcp server');
    } catch (error) {
      // No README found
    }
    
    return false;
  }

  /**
   * Extract MCP configuration from repository
   */
  async extractMcpConfig(owner, repo) {
    // Try to find MCP configuration file
    const configFiles = [
      'mcp.json',
      'mcp.config.json',
      '.mcp/config.json',
      'mcp.yml',
      'mcp.yaml'
    ];
    
    for (const file of configFiles) {
      try {
        const content = await this.fetchFileContent(owner, repo, file);
        if (file.endsWith('.yml') || file.endsWith('.yaml')) {
          const yaml = require('js-yaml');
          return yaml.load(content);
        } else {
          return JSON.parse(content);
        }
      } catch (error) {
        // Continue checking other files
      }
    }
    
    // No explicit config found, return defaults
    return {
      transport: 'stdio',
      environment: {},
      capabilities: []
    };
  }

  /**
   * Extract package information
   */
  async extractPackageInfo(owner, repo) {
    try {
      const packageJson = await this.fetchFileContent(owner, repo, 'package.json');
      const pkg = JSON.parse(packageJson);
      
      return {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        main: pkg.main,
        bin: pkg.bin,
        scripts: pkg.scripts,
        dependencies: pkg.dependencies,
        keywords: pkg.keywords
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract installation instructions from README
   */
  async extractInstallInstructions(owner, repo) {
    try {
      const readme = await this.fetchReadme(owner, repo);
      
      // Extract npm install command
      const npmMatch = readme.match(/npm\s+install\s+(-g\s+)?([^\s\n]+)/);
      if (npmMatch) {
        return {
          type: 'npm',
          package: npmMatch[2],
          global: !!npmMatch[1]
        };
      }
      
      // Extract docker run command
      const dockerMatch = readme.match(/docker\s+run\s+([^\n]+)/);
      if (dockerMatch) {
        return {
          type: 'docker',
          command: dockerMatch[0]
        };
      }
      
      // Default to GitHub clone
      return {
        type: 'github',
        url: `https://github.com/${owner}/${repo}.git`
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build server info from extracted data
   */
  async buildServerInfo({ owner, repo, repoInfo, mcpConfig, packageInfo, installInfo }) {
    const id = this.generateServerId(owner, repo, packageInfo);
    const name = packageInfo?.name || repoInfo.name;
    const description = packageInfo?.description || repoInfo.description || 'MCP server';
    
    // Determine source configuration
    let source;
    if (installInfo?.type === 'npm' && installInfo.package) {
      source = {
        type: 'npm',
        package: installInfo.package,
        version: 'latest'
      };
    } else {
      source = {
        type: 'github',
        url: repoInfo.html_url,
        owner,
        repo
      };
    }
    
    // Determine Docker configuration
    let docker;
    if (source.type === 'npm') {
      docker = {
        build: {
          dockerfile: 'templates/npm.Dockerfile',
          args: {
            PACKAGE: source.package
          }
        }
      };
    } else {
      // Check if repo has Dockerfile first
      const hasDockerfile = await this.checkForDockerfile(owner, repo);
      
      if (hasDockerfile) {
        // Use repo's own Dockerfile
        docker = {
          build: {
            context: `https://github.com/${owner}/${repo}.git`,
            dockerfile: 'Dockerfile'
          }
        };
      } else {
        // Detect language and use appropriate template
        const language = await this.detectLanguage(owner, repo, packageInfo);
        const dockerfileTemplate = this.getDockerfileTemplate(language);
        
        docker = {
          build: {
            dockerfile: dockerfileTemplate,
            args: {
              GITHUB_URL: `https://github.com/${owner}/${repo}.git`
            }
          }
        };
      }
    }
    
    // Build configuration
    const config = {
      port: 3000 + Math.floor(Math.random() * 1000),
      environment: {
        MCP_MODE: mcpConfig.transport || 'stdio',
        ...mcpConfig.environment
      }
    };
    
    // Add volumes if specified
    if (mcpConfig.volumes) {
      config.volumes = mcpConfig.volumes;
    }
    
    // Add required environment variables
    if (mcpConfig.env_required) {
      config.env_required = mcpConfig.env_required;
    }
    
    return {
      id,
      name,
      description,
      category: this.detectCategory(repoInfo, packageInfo),
      source,
      docker,
      config,
      transport: mcpConfig.transport || 'stdio',
      capabilities: mcpConfig.capabilities || [],
      clients: ['claude-code', 'vs-code', 'cursor'],
      repository: repoInfo.html_url,
      author: repoInfo.owner.login,
      stars: repoInfo.stargazers_count,
      lastUpdated: repoInfo.updated_at
    };
  }

  /**
   * Generate a unique server ID
   */
  generateServerId(owner, repo, packageInfo) {
    if (packageInfo?.name) {
      return packageInfo.name
        .replace(/[@\/]/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    }
    
    return `${owner}-${repo}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Detect category based on keywords and description
   */
  detectCategory(repoInfo, packageInfo) {
    const keywords = [
      ...(packageInfo?.keywords || []),
      ...(repoInfo.topics || [])
    ];
    const description = (packageInfo?.description || repoInfo.description || '').toLowerCase();
    
    // Category detection rules
    const categoryRules = {
      'development': ['git', 'github', 'code', 'dev', 'programming'],
      'data': ['database', 'sql', 'query', 'data', 'storage'],
      'ai-ml': ['ai', 'ml', 'machine-learning', 'llm', 'neural'],
      'cloud': ['cloud', 'aws', 'azure', 'gcp', 'deploy'],
      'productivity': ['notion', 'calendar', 'task', 'todo'],
      'finance': ['payment', 'stripe', 'finance', 'billing'],
      'devops': ['docker', 'kubernetes', 'ci', 'cd', 'deploy']
    };
    
    for (const [category, terms] of Object.entries(categoryRules)) {
      for (const term of terms) {
        if (keywords.includes(term) || description.includes(term)) {
          return category;
        }
      }
    }
    
    return 'custom';
  }

  /**
   * Fetch file content from repository
   */
  async fetchFileContent(owner, repo, filePath) {
    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: this.headers }
    );
    
    if (response.data.content) {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    
    throw new Error('File content not found');
  }

  /**
   * Fetch README content
   */
  async fetchReadme(owner, repo) {
    const readmeFiles = ['README.md', 'readme.md', 'README', 'readme'];
    
    for (const file of readmeFiles) {
      try {
        return await this.fetchFileContent(owner, repo, file);
      } catch (error) {
        // Continue checking other files
      }
    }
    
    throw new Error('README not found');
  }

  /**
   * Check if repository has a Dockerfile
   */
  async checkForDockerfile(owner, repo) {
    const dockerfiles = ['Dockerfile', 'dockerfile', '.dockerfile'];
    
    for (const file of dockerfiles) {
      try {
        await this.fetchFileContent(owner, repo, file);
        return true;
      } catch (error) {
        // Continue checking
      }
    }
    
    return false;
  }

  /**
   * Detect programming language of the repository
   */
  async detectLanguage(owner, repo, packageInfo) {
    // Use GitHub's language detection first
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/languages`,
        { headers: this.headers }
      );
      const languages = response.data;
      const primaryLanguage = Object.keys(languages)[0];
      
      if (primaryLanguage) {
        // Map GitHub languages to our templates
        const languageMap = {
          'JavaScript': 'node',
          'TypeScript': 'node',
          'Python': 'python',
          'Go': 'go',
          'Rust': 'rust',
          'Ruby': 'ruby',
          'PHP': 'php'
        };
        
        if (languageMap[primaryLanguage]) {
          return languageMap[primaryLanguage];
        }
      }
    } catch (error) {
      // Fallback to file detection
    }
    
    // Check for language-specific files
    const fileChecks = [
      { files: ['package.json', 'package-lock.json', 'yarn.lock'], language: 'node' },
      { files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'], language: 'python' },
      { files: ['go.mod', 'go.sum'], language: 'go' },
      { files: ['Cargo.toml', 'Cargo.lock'], language: 'rust' },
      { files: ['Gemfile', 'Gemfile.lock', '*.gemspec'], language: 'ruby' },
      { files: ['composer.json', 'composer.lock'], language: 'php' }
    ];
    
    for (const check of fileChecks) {
      for (const file of check.files) {
        try {
          if (file.includes('*')) {
            // Handle wildcards by checking file list
            const response = await axios.get(
              `https://api.github.com/repos/${owner}/${repo}/contents/`,
              { headers: this.headers }
            );
            const files = response.data;
            const pattern = new RegExp(file.replace('*', '.*'));
            if (files.some(f => pattern.test(f.name))) {
              return check.language;
            }
          } else {
            await this.fetchFileContent(owner, repo, file);
            return check.language;
          }
        } catch (error) {
          // Continue checking
        }
      }
    }
    
    // Default to generic if no language detected
    return 'generic';
  }

  /**
   * Get Dockerfile template for a given language
   */
  getDockerfileTemplate(language) {
    const templateMap = {
      'node': 'templates/github-node.Dockerfile',
      'python': 'templates/github-python.Dockerfile',
      'go': 'templates/github-go.Dockerfile',
      'rust': 'templates/github-rust.Dockerfile',
      'ruby': 'templates/github-ruby.Dockerfile',
      'php': 'templates/github-generic.Dockerfile', // PHP uses generic for now
      'generic': 'templates/github-generic.Dockerfile'
    };
    
    return templateMap[language] || templateMap['generic'];
  }
}

module.exports = GitHubParser;