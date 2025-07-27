/**
 * API Router for Catalog Service
 * Provides HTTP endpoints for catalog management
 */

const express = require('express');
const CatalogService = require('./service');
const GitHubParser = require('../github/parser');

const router = express.Router();
const catalogService = new CatalogService();
const githubParser = new GitHubParser();

/**
 * Get popular MCP servers
 */
router.get('/popular', async (req, res) => {
  try {
    const servers = await catalogService.getPopularServers();
    res.json({ success: true, servers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get installed servers
 */
router.get('/installed', async (req, res) => {
  try {
    const servers = await catalogService.getInstalledServers();
    res.json({ success: true, servers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get catalog servers
 */
router.get('/servers', async (req, res) => {
  try {
    const catalog = await catalogService.loadCatalog();
    res.json({ success: true, servers: catalog.servers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from GitHub
 */
router.post('/add-from-github', async (req, res) => {
  try {
    const { githubUrl } = req.body;
    if (!githubUrl) {
      return res.status(400).json({ success: false, error: 'GitHub URL is required' });
    }

    const serverInfo = await catalogService.addFromGitHub(githubUrl);
    res.json({ success: true, server: serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from NPM
 */
router.post('/add-from-npm', async (req, res) => {
  try {
    const { packageName } = req.body;
    if (!packageName) {
      return res.status(400).json({ success: false, error: 'NPM package name is required' });
    }

    const serverInfo = await catalogService.addFromNpm(packageName);
    res.json({ success: true, server: serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from PyPI
 */
router.post('/add-pip', async (req, res) => {
  try {
    const { package: packageName } = req.body;
    if (!packageName) {
      return res.status(400).json({ success: false, error: 'PyPI package name is required' });
    }

    const serverInfo = await catalogService.addFromPip(packageName);
    res.json({ success: true, ...serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from Cargo
 */
router.post('/add-cargo', async (req, res) => {
  try {
    const { crate: crateName } = req.body;
    if (!crateName) {
      return res.status(400).json({ success: false, error: 'Cargo crate name is required' });
    }

    const serverInfo = await catalogService.addFromCargo(crateName);
    res.json({ success: true, ...serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from Go
 */
router.post('/add-go', async (req, res) => {
  try {
    const { module: modulePath } = req.body;
    if (!modulePath) {
      return res.status(400).json({ success: false, error: 'Go module path is required' });
    }

    const serverInfo = await catalogService.addFromGo(modulePath);
    res.json({ success: true, ...serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from Ruby Gem
 */
router.post('/add-gem', async (req, res) => {
  try {
    const { gem: gemName } = req.body;
    if (!gemName) {
      return res.status(400).json({ success: false, error: 'Ruby gem name is required' });
    }

    const serverInfo = await catalogService.addFromGem(gemName);
    res.json({ success: true, ...serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add server from Composer
 */
router.post('/add-composer', async (req, res) => {
  try {
    const { package: packageName } = req.body;
    if (!packageName) {
      return res.status(400).json({ success: false, error: 'Composer package name is required' });
    }

    const serverInfo = await catalogService.addFromComposer(packageName);
    res.json({ success: true, ...serverInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Install a server
 */
router.post('/install/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const result = await catalogService.installServer(serverId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Parse GitHub repository
 */
router.post('/github/parse', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'GitHub URL is required' });
    }

    const repoInfo = await githubParser.parseRepository(url);
    res.json({ success: true, repository: repoInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;