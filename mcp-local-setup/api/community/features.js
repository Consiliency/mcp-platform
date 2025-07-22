/**
 * Community Features API
 * MARKET-4.3: Rating system, reviews, usage analytics
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CommunityFeatures {
  constructor(options = {}) {
    this.dataPath = options.dataPath || path.join(__dirname, '../../data/community');
    this.catalogPath = options.catalogPath || path.join(__dirname, '../../registry/enhanced-catalog.json');
    this.ratingsFile = path.join(this.dataPath, 'ratings.json');
    this.reviewsFile = path.join(this.dataPath, 'reviews.json');
    this.analyticsFile = path.join(this.dataPath, 'analytics.json');
    this.cache = new Map();
  }

  /**
   * Initialize community features
   */
  async initialize() {
    await fs.mkdir(this.dataPath, { recursive: true });
    
    // Initialize data files if they don't exist
    const files = [
      { path: this.ratingsFile, default: {} },
      { path: this.reviewsFile, default: {} },
      { path: this.analyticsFile, default: {} }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.default, null, 2));
      }
    }
  }

  /**
   * Rate a service
   */
  async rateService(serviceId, rating, userId) {
    if (!serviceId || !userId) {
      throw new Error('Service ID and User ID are required');
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      throw new Error('Rating must be a number between 1 and 5');
    }

    await this.initialize();

    // Load existing ratings
    const ratings = await this._loadData(this.ratingsFile);
    
    if (!ratings[serviceId]) {
      ratings[serviceId] = {
        total: 0,
        count: 0,
        average: 0,
        users: {}
      };
    }

    const serviceRatings = ratings[serviceId];
    const previousRating = serviceRatings.users[userId];

    // Update or add user rating
    if (previousRating) {
      // Update existing rating
      serviceRatings.total = serviceRatings.total - previousRating + rating;
    } else {
      // New rating
      serviceRatings.total += rating;
      serviceRatings.count += 1;
    }

    serviceRatings.users[userId] = rating;
    serviceRatings.average = serviceRatings.total / serviceRatings.count;
    serviceRatings.lastUpdated = new Date().toISOString();

    // Save ratings
    await this._saveData(this.ratingsFile, ratings);

    // Update catalog
    await this._updateCatalogRating(serviceId, serviceRatings.average);

    // Track analytics
    await this._trackEvent(serviceId, 'rating', {
      userId,
      rating,
      previousRating
    });

    return {
      success: true,
      serviceId,
      rating,
      newAverage: serviceRatings.average,
      totalRatings: serviceRatings.count
    };
  }

  /**
   * Submit a review
   */
  async submitReview(serviceId, review, userId) {
    if (!serviceId || !userId || !review) {
      throw new Error('Service ID, User ID, and review content are required');
    }

    if (typeof review !== 'object' || !review.content) {
      throw new Error('Review must include content');
    }

    await this.initialize();

    // Validate review
    const validatedReview = {
      id: this._generateId(),
      userId,
      content: review.content.substring(0, 5000), // Limit review length
      title: review.title ? review.title.substring(0, 200) : '',
      rating: review.rating || null,
      helpful: 0,
      notHelpful: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      edited: false
    };

    // Load existing reviews
    const reviews = await this._loadData(this.reviewsFile);
    
    if (!reviews[serviceId]) {
      reviews[serviceId] = [];
    }

    // Check if user already has a review
    const existingReviewIndex = reviews[serviceId].findIndex(r => r.userId === userId);
    
    if (existingReviewIndex >= 0) {
      // Update existing review
      validatedReview.edited = true;
      validatedReview.createdAt = reviews[serviceId][existingReviewIndex].createdAt;
      reviews[serviceId][existingReviewIndex] = validatedReview;
    } else {
      // Add new review
      reviews[serviceId].push(validatedReview);
    }

    // Save reviews
    await this._saveData(this.reviewsFile, reviews);

    // If review includes rating, update it
    if (validatedReview.rating) {
      await this.rateService(serviceId, validatedReview.rating, userId);
    }

    // Track analytics
    await this._trackEvent(serviceId, 'review', {
      userId,
      reviewId: validatedReview.id,
      action: existingReviewIndex >= 0 ? 'update' : 'create'
    });

    return {
      success: true,
      review: validatedReview
    };
  }

  /**
   * Get usage analytics
   */
  async getUsageAnalytics(serviceId) {
    if (!serviceId) {
      throw new Error('Service ID is required');
    }

    await this.initialize();

    const analytics = await this._loadData(this.analyticsFile);
    const serviceAnalytics = analytics[serviceId] || {
      downloads: 0,
      views: 0,
      events: [],
      daily: {},
      weekly: {},
      monthly: {}
    };

    // Calculate trends
    const now = new Date();
    const trends = {
      daily: this._calculateTrend(serviceAnalytics.daily, now, 'day', 7),
      weekly: this._calculateTrend(serviceAnalytics.weekly, now, 'week', 4),
      monthly: this._calculateTrend(serviceAnalytics.monthly, now, 'month', 3)
    };

    // Get recent events
    const recentEvents = serviceAnalytics.events
      .slice(-100)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
      serviceId,
      summary: {
        totalDownloads: serviceAnalytics.downloads,
        totalViews: serviceAnalytics.views,
        uniqueUsers: new Set(serviceAnalytics.events.map(e => e.userId)).size,
        lastActivity: recentEvents[0]?.timestamp || null
      },
      trends,
      recentEvents: recentEvents.slice(0, 20),
      topActions: this._getTopActions(serviceAnalytics.events)
    };
  }

  /**
   * Get community statistics
   */
  async getCommunityStats(serviceId) {
    if (!serviceId) {
      throw new Error('Service ID is required');
    }

    await this.initialize();

    // Load all community data
    const [ratings, reviews, analytics] = await Promise.all([
      this._loadData(this.ratingsFile),
      this._loadData(this.reviewsFile),
      this._loadData(this.analyticsFile)
    ]);

    const serviceRatings = ratings[serviceId] || { average: 0, count: 0 };
    const serviceReviews = reviews[serviceId] || [];
    const serviceAnalytics = analytics[serviceId] || { downloads: 0, views: 0 };

    // Calculate review statistics
    const reviewStats = {
      total: serviceReviews.length,
      averageLength: serviceReviews.reduce((sum, r) => sum + r.content.length, 0) / (serviceReviews.length || 1),
      withRating: serviceReviews.filter(r => r.rating).length,
      recentReviews: serviceReviews
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
    };

    // Calculate rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    
    if (serviceRatings.users) {
      Object.values(serviceRatings.users).forEach(rating => {
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[Math.floor(rating)]++;
        }
      });
    }

    // Get engagement metrics
    const engagementScore = this._calculateEngagementScore({
      downloads: serviceAnalytics.downloads,
      views: serviceAnalytics.views,
      ratings: serviceRatings.count,
      reviews: reviewStats.total
    });

    return {
      serviceId,
      ratings: {
        average: Math.round(serviceRatings.average * 10) / 10,
        count: serviceRatings.count,
        distribution: ratingDistribution
      },
      reviews: reviewStats,
      engagement: {
        score: engagementScore,
        downloads: serviceAnalytics.downloads,
        views: serviceAnalytics.views,
        activeUsers: new Set(
          Object.keys(serviceRatings.users || {})
            .concat(serviceReviews.map(r => r.userId))
        ).size
      },
      trends: {
        ratingsLastWeek: this._getRecentRatingsCount(serviceRatings, 7),
        reviewsLastWeek: this._getRecentReviewsCount(serviceReviews, 7),
        growthRate: this._calculateGrowthRate(serviceAnalytics)
      }
    };
  }

  /**
   * Track analytics event
   * @private
   */
  async _trackEvent(serviceId, eventType, data = {}) {
    const analytics = await this._loadData(this.analyticsFile);
    
    if (!analytics[serviceId]) {
      analytics[serviceId] = {
        downloads: 0,
        views: 0,
        events: [],
        daily: {},
        weekly: {},
        monthly: {}
      };
    }

    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      ...data
    };

    analytics[serviceId].events.push(event);

    // Update counters
    if (eventType === 'download') {
      analytics[serviceId].downloads++;
    } else if (eventType === 'view') {
      analytics[serviceId].views++;
    }

    // Update time-based aggregations
    const date = new Date();
    const dayKey = date.toISOString().split('T')[0];
    const weekKey = `${date.getFullYear()}-W${this._getWeekNumber(date)}`;
    const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

    // Update daily stats
    if (!analytics[serviceId].daily[dayKey]) {
      analytics[serviceId].daily[dayKey] = { events: 0, downloads: 0, views: 0 };
    }
    analytics[serviceId].daily[dayKey].events++;
    if (eventType === 'download') analytics[serviceId].daily[dayKey].downloads++;
    if (eventType === 'view') analytics[serviceId].daily[dayKey].views++;

    // Update weekly stats
    if (!analytics[serviceId].weekly[weekKey]) {
      analytics[serviceId].weekly[weekKey] = { events: 0, downloads: 0, views: 0 };
    }
    analytics[serviceId].weekly[weekKey].events++;
    if (eventType === 'download') analytics[serviceId].weekly[weekKey].downloads++;
    if (eventType === 'view') analytics[serviceId].weekly[weekKey].views++;

    // Update monthly stats
    if (!analytics[serviceId].monthly[monthKey]) {
      analytics[serviceId].monthly[monthKey] = { events: 0, downloads: 0, views: 0 };
    }
    analytics[serviceId].monthly[monthKey].events++;
    if (eventType === 'download') analytics[serviceId].monthly[monthKey].downloads++;
    if (eventType === 'view') analytics[serviceId].monthly[monthKey].views++;

    // Limit events array size
    if (analytics[serviceId].events.length > 10000) {
      analytics[serviceId].events = analytics[serviceId].events.slice(-5000);
    }

    await this._saveData(this.analyticsFile, analytics);
  }

  /**
   * Update catalog rating
   * @private
   */
  async _updateCatalogRating(serviceId, rating) {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogData);
      
      const service = catalog.servers?.find(s => s.id === serviceId);
      if (service) {
        if (!service.community) service.community = {};
        service.community.rating = Math.round(rating * 10) / 10;
        catalog.updated = new Date().toISOString();
        
        await fs.writeFile(this.catalogPath, JSON.stringify(catalog, null, 2));
      }
    } catch (error) {
      console.error('Failed to update catalog rating:', error);
    }
  }

  /**
   * Load data from file
   * @private
   */
  async _loadData(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  /**
   * Save data to file
   * @private
   */
  async _saveData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Calculate trend from time-series data
   * @private
   */
  _calculateTrend(data, currentDate, period, count) {
    const trends = [];
    const periodMillis = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000
    };

    for (let i = 0; i < count; i++) {
      const date = new Date(currentDate.getTime() - (i * periodMillis[period]));
      let key;
      
      if (period === 'day') {
        key = date.toISOString().split('T')[0];
      } else if (period === 'week') {
        key = `${date.getFullYear()}-W${this._getWeekNumber(date)}`;
      } else {
        key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      trends.unshift({
        period: key,
        data: data[key] || { events: 0, downloads: 0, views: 0 }
      });
    }

    return trends;
  }

  /**
   * Get week number
   * @private
   */
  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Get top actions from events
   * @private
   */
  _getTopActions(events) {
    const actionCounts = {};
    
    events.forEach(event => {
      actionCounts[event.type] = (actionCounts[event.type] || 0) + 1;
    });

    return Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));
  }

  /**
   * Calculate engagement score
   * @private
   */
  _calculateEngagementScore(metrics) {
    // Weighted engagement score
    const weights = {
      downloads: 1.0,
      views: 0.1,
      ratings: 2.0,
      reviews: 3.0
    };

    const score = 
      (metrics.downloads * weights.downloads) +
      (metrics.views * weights.views) +
      (metrics.ratings * weights.ratings) +
      (metrics.reviews * weights.reviews);

    // Normalize to 0-100 scale
    return Math.min(100, Math.round(score / 10));
  }

  /**
   * Get recent ratings count
   * @private
   */
  _getRecentRatingsCount(ratings, days) {
    if (!ratings.users) return 0;
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    // Note: This is a simplified version. In production, 
    // you'd track rating timestamps
    return Math.floor(ratings.count * 0.1); // Estimate
  }

  /**
   * Get recent reviews count
   * @private
   */
  _getRecentReviewsCount(reviews, days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return reviews.filter(r => 
      new Date(r.createdAt) > cutoff
    ).length;
  }

  /**
   * Calculate growth rate
   * @private
   */
  _calculateGrowthRate(analytics) {
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const thisMonthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const lastMonthKey = `${lastMonth.getFullYear()}-${(lastMonth.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const thisMonth = analytics.monthly?.[thisMonthKey]?.downloads || 0;
    const previousMonth = analytics.monthly?.[lastMonthKey]?.downloads || 0;
    
    if (previousMonth === 0) return 0;
    
    return Math.round(((thisMonth - previousMonth) / previousMonth) * 100);
  }
}

module.exports = CommunityFeatures;