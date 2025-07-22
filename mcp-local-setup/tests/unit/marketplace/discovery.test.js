/**
 * Unit tests for MarketplaceDiscovery API
 */

const path = require('path');
const MarketplaceDiscovery = require('../../../api/marketplace/discovery');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn()
  }
}));

const fs = require('fs').promises;

describe('MarketplaceDiscovery', () => {
  let discovery;
  let mockCatalog;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create test catalog data
    mockCatalog = {
      version: "2.0",
      updated: "2025-01-22",
      categories: {
        development: {
          name: "Development Tools",
          description: "Tools for software development"
        },
        data: {
          name: "Data Access",
          description: "Tools for data management"
        }
      },
      servers: [
        {
          id: "test-service-1",
          name: "Test Service 1",
          description: "A test service for development",
          version: "1.0.0",
          category: "development",
          featured: true,
          tags: ["testing", "development"],
          community: {
            rating: 4.5,
            downloads: 1500,
            reviews: []
          }
        },
        {
          id: "test-service-2",
          name: "Test Service 2",
          description: "A data management service",
          version: "2.1.0",
          category: "data",
          featured: false,
          tags: ["data", "analytics"],
          community: {
            rating: 3.8,
            downloads: 800,
            reviews: []
          }
        }
      ]
    };

    // Mock file read
    fs.readFile.mockResolvedValue(JSON.stringify(mockCatalog));

    // Create discovery instance
    discovery = new MarketplaceDiscovery();
  });

  describe('initialize', () => {
    it('should load catalog and initialize data structures', async () => {
      await discovery.initialize();

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('enhanced-catalog.json'),
        'utf-8'
      );
      expect(discovery.services.size).toBe(2);
      expect(discovery.categories.size).toBe(2);
      expect(discovery.featured.size).toBe(1);
    });

    it('should handle initialization errors', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(discovery.initialize()).rejects.toThrow('Failed to initialize marketplace');
    });
  });

  describe('searchServices', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should search services by query', async () => {
      const results = await discovery.searchServices('test');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Test Service 1');
    });

    it('should filter by category', async () => {
      const results = await discovery.searchServices('', { category: 'data' });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('data');
    });

    it('should filter by minimum rating', async () => {
      const results = await discovery.searchServices('', { minRating: 4.0 });

      expect(results).toHaveLength(1);
      expect(results[0].rating).toBeGreaterThanOrEqual(4.0);
    });

    it('should filter by tags', async () => {
      const results = await discovery.searchServices('', { tags: ['analytics'] });

      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('analytics');
    });

    it('should sort by downloads', async () => {
      const results = await discovery.searchServices('', { sort: 'downloads' });

      expect(results[0].downloads).toBe(1500);
      expect(results[1].downloads).toBe(800);
    });

    it('should sort by rating', async () => {
      const results = await discovery.searchServices('', { sort: 'rating' });

      expect(results[0].rating).toBe(4.5);
      expect(results[1].rating).toBe(3.8);
    });
  });

  describe('getFeaturedServices', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should return only featured services', async () => {
      const featured = await discovery.getFeaturedServices();

      expect(featured).toHaveLength(1);
      expect(featured[0].featured).toBe(true);
      expect(featured[0].id).toBe('test-service-1');
    });

    it('should sort featured services by score', async () => {
      // Add another featured service
      mockCatalog.servers.push({
        id: "test-service-3",
        name: "Test Service 3",
        featured: true,
        community: {
          rating: 5.0,
          downloads: 500
        }
      });
      
      // Re-initialize
      fs.readFile.mockResolvedValue(JSON.stringify(mockCatalog));
      discovery = new MarketplaceDiscovery();
      await discovery.initialize();

      const featured = await discovery.getFeaturedServices();

      expect(featured[0].rating).toBe(5.0); // Higher rating wins despite lower downloads
    });
  });

  describe('browseByCategory', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should return services in a category', async () => {
      const result = await discovery.browseByCategory('development');

      expect(result.category.name).toBe('Development Tools');
      expect(result.services).toHaveLength(1);
      expect(result.services[0].category).toBe('development');
      expect(result.total).toBe(1);
    });

    it('should throw error for invalid category', async () => {
      await expect(discovery.browseByCategory('invalid')).rejects.toThrow("Category 'invalid' not found");
    });

    it('should sort services by downloads', async () => {
      // Add another development service
      mockCatalog.servers.push({
        id: "test-service-3",
        name: "Test Service 3",
        category: "development",
        community: { downloads: 2000 }
      });
      
      // Re-initialize
      fs.readFile.mockResolvedValue(JSON.stringify(mockCatalog));
      discovery = new MarketplaceDiscovery();
      await discovery.initialize();

      const result = await discovery.browseByCategory('development');

      expect(result.services[0].downloads).toBe(2000);
      expect(result.services[1].downloads).toBe(1500);
    });
  });

  describe('getServiceDetails', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should return detailed service information', async () => {
      const details = await discovery.getServiceDetails('test-service-1');

      expect(details.id).toBe('test-service-1');
      expect(details.name).toBe('Test Service 1');
      expect(details.version).toBe('1.0.0');
      expect(details.community.rating).toBe(4.5);
      expect(details.community.downloads).toBe(1500);
      expect(details.featured).toBe(true);
    });

    it('should throw error for non-existent service', async () => {
      await expect(discovery.getServiceDetails('invalid-id')).rejects.toThrow("Service 'invalid-id' not found");
    });

    it('should include all required fields', async () => {
      const details = await discovery.getServiceDetails('test-service-1');

      expect(details).toHaveProperty('source');
      expect(details).toHaveProperty('docker');
      expect(details).toHaveProperty('config');
      expect(details).toHaveProperty('dependencies');
      expect(details).toHaveProperty('requirements');
      expect(details).toHaveProperty('documentation');
      expect(details).toHaveProperty('examples');
    });
  });

  describe('getCategories', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should return all categories with service counts', async () => {
      const categories = await discovery.getCategories();

      expect(categories).toHaveLength(2);
      expect(categories[0]).toEqual({
        id: 'development',
        name: 'Development Tools',
        description: 'Tools for software development',
        serviceCount: 1
      });
      expect(categories[1]).toEqual({
        id: 'data',
        name: 'Data Access',
        description: 'Tools for data management',
        serviceCount: 1
      });
    });
  });

  describe('private methods', () => {
    beforeEach(async () => {
      await discovery.initialize();
    });

    it('should calculate relevance score correctly', () => {
      const service = {
        name: 'Test Service',
        description: 'A test service for testing',
        tags: ['test', 'demo'],
        featured: true,
        downloads: 1000,
        rating: 4.5
      };

      const score = discovery._calculateRelevanceScore(service, 'test');
      expect(score).toBeGreaterThan(0);

      // Exact match should score higher
      const exactScore = discovery._calculateRelevanceScore(service, 'Test Service');
      expect(exactScore).toBeGreaterThan(score);
    });

    it('should match version constraints', () => {
      expect(discovery._matchesVersionConstraint('1.2.3', 'latest')).toBe(true);
      expect(discovery._matchesVersionConstraint('1.2.3', '1.2.3')).toBe(true);
      expect(discovery._matchesVersionConstraint('1.2.3', '^1.0.0')).toBe(true);
      expect(discovery._matchesVersionConstraint('2.0.0', '^1.0.0')).toBe(false);
    });
  });
});