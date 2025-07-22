/**
 * Service Marketplace Discovery API
 * MARKET-4.1: Search, featured services, category browsing
 */

const fs = require('fs').promises;
const path = require('path');

class MarketplaceDiscovery {
  constructor(options = {}) {
    this.catalogPath = options.catalogPath || path.join(__dirname, '../../registry/enhanced-catalog.json');
    this.marketplace = null;
    this.services = new Map();
    this.categories = new Map();
    this.featured = new Set();
  }

  /**
   * Initialize marketplace discovery
   */
  async initialize() {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogData);
      
      // Load categories
      if (catalog.categories) {
        Object.entries(catalog.categories).forEach(([id, category]) => {
          this.categories.set(id, {
            id,
            ...category,
            services: []
          });
        });
      }

      // Load services
      if (catalog.servers) {
        catalog.servers.forEach(service => {
          const serviceData = {
            ...service,
            rating: service.community?.rating || 0,
            downloads: service.community?.downloads || 0,
            reviews: service.community?.reviews || [],
            tags: service.tags || [],
            featured: service.featured || false
          };

          this.services.set(service.id, serviceData);
          
          // Add to category
          if (service.category && this.categories.has(service.category)) {
            this.categories.get(service.category).services.push(service.id);
          }

          // Track featured services
          if (serviceData.featured) {
            this.featured.add(service.id);
          }
        });
      }

      this.marketplace = catalog;
      return true;
    } catch (error) {
      throw new Error(`Failed to initialize marketplace: ${error.message}`);
    }
  }

  /**
   * Search for services in marketplace
   */
  async searchServices(query, filters = {}) {
    if (!this.marketplace) {
      await this.initialize();
    }

    const results = [];
    const searchQuery = query?.toLowerCase() || '';

    for (const [id, service] of this.services) {
      // Basic text search
      const searchableText = [
        service.name,
        service.description,
        ...(service.tags || [])
      ].join(' ').toLowerCase();

      const matchesQuery = !searchQuery || searchableText.includes(searchQuery);

      // Apply filters
      const matchesCategory = !filters.category || service.category === filters.category;
      const matchesMinRating = !filters.minRating || service.rating >= filters.minRating;
      const matchesTags = !filters.tags || filters.tags.every(tag => 
        service.tags?.includes(tag)
      );
      const matchesVersion = !filters.version || 
        this._matchesVersionConstraint(service.version, filters.version);

      if (matchesQuery && matchesCategory && matchesMinRating && matchesTags && matchesVersion) {
        results.push(this._formatServiceResult(service));
      }
    }

    // Sort results
    return this._sortResults(results, filters.sort || 'relevance', searchQuery);
  }

  /**
   * Get featured services
   */
  async getFeaturedServices() {
    if (!this.marketplace) {
      await this.initialize();
    }

    const featured = [];
    for (const serviceId of this.featured) {
      const service = this.services.get(serviceId);
      if (service) {
        featured.push(this._formatServiceResult(service));
      }
    }

    // Sort by rating and downloads
    return featured.sort((a, b) => {
      const scoreA = (a.rating * 100) + (a.downloads * 0.01);
      const scoreB = (b.rating * 100) + (b.downloads * 0.01);
      return scoreB - scoreA;
    });
  }

  /**
   * Browse services by category
   */
  async browseByCategory(category) {
    if (!this.marketplace) {
      await this.initialize();
    }

    const categoryData = this.categories.get(category);
    if (!categoryData) {
      throw new Error(`Category '${category}' not found`);
    }

    const services = [];
    for (const serviceId of categoryData.services) {
      const service = this.services.get(serviceId);
      if (service) {
        services.push(this._formatServiceResult(service));
      }
    }

    return {
      category: {
        id: categoryData.id,
        name: categoryData.name,
        description: categoryData.description
      },
      services: services.sort((a, b) => b.downloads - a.downloads),
      total: services.length
    };
  }

  /**
   * Get service details
   */
  async getServiceDetails(serviceId) {
    if (!this.marketplace) {
      await this.initialize();
    }

    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service '${serviceId}' not found`);
    }

    // Return detailed service information
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      version: service.version,
      category: service.category,
      source: service.source,
      docker: service.docker,
      config: service.config,
      tags: service.tags || [],
      featured: service.featured || false,
      community: {
        rating: service.rating,
        downloads: service.downloads,
        reviews: service.reviews || [],
        lastUpdated: service.lastUpdated || new Date().toISOString()
      },
      dependencies: service.dependencies || [],
      requirements: service.requirements || {},
      documentation: service.documentation || {},
      examples: service.examples || []
    };
  }

  /**
   * Format service result for consistent output
   * @private
   */
  _formatServiceResult(service) {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      version: service.version,
      category: service.category,
      rating: service.rating,
      downloads: service.downloads,
      tags: service.tags || [],
      featured: service.featured || false
    };
  }

  /**
   * Sort search results
   * @private
   */
  _sortResults(results, sortBy, query) {
    switch (sortBy) {
      case 'downloads':
        return results.sort((a, b) => b.downloads - a.downloads);
      
      case 'rating':
        return results.sort((a, b) => b.rating - a.rating);
      
      case 'name':
        return results.sort((a, b) => a.name.localeCompare(b.name));
      
      case 'relevance':
      default:
        // Simple relevance scoring based on query match position
        if (query) {
          return results.sort((a, b) => {
            const scoreA = this._calculateRelevanceScore(a, query);
            const scoreB = this._calculateRelevanceScore(b, query);
            return scoreB - scoreA;
          });
        }
        return results;
    }
  }

  /**
   * Calculate relevance score for search result
   * @private
   */
  _calculateRelevanceScore(service, query) {
    let score = 0;
    const q = query.toLowerCase();

    // Exact name match
    if (service.name.toLowerCase() === q) score += 100;
    // Name contains query
    else if (service.name.toLowerCase().includes(q)) score += 50;
    
    // Description contains query
    if (service.description.toLowerCase().includes(q)) score += 20;
    
    // Tag matches
    if (service.tags?.some(tag => tag.toLowerCase().includes(q))) score += 30;
    
    // Boost featured services
    if (service.featured) score += 10;
    
    // Consider popularity
    score += (service.downloads * 0.001) + (service.rating * 2);
    
    return score;
  }

  /**
   * Check if version matches constraint
   * @private
   */
  _matchesVersionConstraint(version, constraint) {
    // Simple version matching - can be enhanced with semver
    if (constraint === 'latest') return true;
    if (constraint.startsWith('^')) {
      const major = version.split('.')[0];
      return constraint.substring(1).startsWith(major);
    }
    return version === constraint;
  }

  /**
   * Get all available categories
   */
  async getCategories() {
    if (!this.marketplace) {
      await this.initialize();
    }

    const categories = [];
    for (const [id, category] of this.categories) {
      categories.push({
        id,
        name: category.name,
        description: category.description,
        serviceCount: category.services.length
      });
    }

    return categories;
  }
}

module.exports = MarketplaceDiscovery;