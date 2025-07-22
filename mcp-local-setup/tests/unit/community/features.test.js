/**
 * Unit tests for CommunityFeatures API
 */

const path = require('path');
const CommunityFeatures = require('../../../api/community/features');

// Mock modules
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn()
  }
}));

const fs = require('fs').promises;

describe('CommunityFeatures', () => {
  let community;
  let mockRatings;
  let mockReviews;
  let mockAnalytics;
  let mockCatalog;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create test data
    mockRatings = {
      'service-1': {
        total: 17,
        count: 4,
        average: 4.25,
        users: {
          'user-1': 5,
          'user-2': 4,
          'user-3': 4,
          'user-4': 4
        }
      }
    };

    mockReviews = {
      'service-1': [
        {
          id: 'review-1',
          userId: 'user-1',
          content: 'Great service!',
          title: 'Excellent',
          rating: 5,
          helpful: 2,
          notHelpful: 0,
          createdAt: '2025-01-20T10:00:00Z',
          updatedAt: '2025-01-20T10:00:00Z',
          edited: false
        }
      ]
    };

    mockAnalytics = {
      'service-1': {
        downloads: 100,
        views: 500,
        events: [
          { type: 'download', timestamp: '2025-01-20T10:00:00Z', userId: 'user-1' },
          { type: 'view', timestamp: '2025-01-20T09:00:00Z', userId: 'user-2' }
        ],
        daily: {
          '2025-01-20': { events: 2, downloads: 1, views: 1 }
        },
        weekly: {
          '2025-W4': { events: 10, downloads: 5, views: 5 }
        },
        monthly: {
          '2025-01': { events: 50, downloads: 20, views: 30 }
        }
      }
    };

    mockCatalog = {
      servers: [
        {
          id: 'service-1',
          name: 'Test Service',
          community: {}
        }
      ]
    };

    // Mock file operations
    fs.mkdir.mockResolvedValue();
    fs.access.mockImplementation(() => Promise.reject(new Error('File not found')));
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.includes('ratings.json')) {
        return Promise.resolve(JSON.stringify(mockRatings));
      } else if (filePath.includes('reviews.json')) {
        return Promise.resolve(JSON.stringify(mockReviews));
      } else if (filePath.includes('analytics.json')) {
        return Promise.resolve(JSON.stringify(mockAnalytics));
      } else if (filePath.includes('catalog.json')) {
        return Promise.resolve(JSON.stringify(mockCatalog));
      }
      return Promise.resolve('{}');
    });
    fs.writeFile.mockResolvedValue();

    // Create community instance
    community = new CommunityFeatures();
  });

  describe('rateService', () => {
    it('should add a new rating', async () => {
      const result = await community.rateService('service-2', 5, 'user-5');

      expect(result.success).toBe(true);
      expect(result.rating).toBe(5);
      expect(result.newAverage).toBe(5);
      expect(result.totalRatings).toBe(1);

      // Check that data was saved
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ratings.json'),
        expect.stringContaining('"service-2"')
      );
    });

    it('should update an existing rating', async () => {
      const result = await community.rateService('service-1', 3, 'user-1');

      expect(result.success).toBe(true);
      expect(result.rating).toBe(3);
      expect(result.newAverage).toBe(3.75); // (3+4+4+4)/4
      expect(result.totalRatings).toBe(4); // Count stays the same
    });

    it('should validate rating range', async () => {
      await expect(community.rateService('service-1', 0, 'user-1'))
        .rejects.toThrow('Rating must be a number between 1 and 5');
      
      await expect(community.rateService('service-1', 6, 'user-1'))
        .rejects.toThrow('Rating must be a number between 1 and 5');
    });

    it('should require service ID and user ID', async () => {
      await expect(community.rateService(null, 5, 'user-1'))
        .rejects.toThrow('Service ID and User ID are required');
      
      await expect(community.rateService('service-1', 5, null))
        .rejects.toThrow('Service ID and User ID are required');
    });

    it('should update catalog rating', async () => {
      await community.rateService('service-1', 5, 'user-5');

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('catalog.json'),
        expect.stringContaining('"rating"')
      );
    });

    it('should track analytics event', async () => {
      await community.rateService('service-1', 5, 'user-5');

      const analyticsCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('analytics.json')
      );
      expect(analyticsCall).toBeDefined();
      const analyticsData = JSON.parse(analyticsCall[1]);
      expect(analyticsData['service-1'].events).toContainEqual(
        expect.objectContaining({
          type: 'rating',
          userId: 'user-5',
          rating: 5
        })
      );
    });
  });

  describe('submitReview', () => {
    it('should add a new review', async () => {
      const review = {
        content: 'This is a test review',
        title: 'Test Review',
        rating: 4
      };

      const result = await community.submitReview('service-1', review, 'user-5');

      expect(result.success).toBe(true);
      expect(result.review.content).toBe(review.content);
      expect(result.review.title).toBe(review.title);
      expect(result.review.userId).toBe('user-5');
      expect(result.review.id).toBeDefined();
    });

    it('should update an existing review', async () => {
      const review = {
        content: 'Updated review content',
        title: 'Updated'
      };

      const result = await community.submitReview('service-1', review, 'user-1');

      expect(result.success).toBe(true);
      expect(result.review.content).toBe(review.content);
      expect(result.review.edited).toBe(true);
    });

    it('should validate review content', async () => {
      await expect(community.submitReview('service-1', null, 'user-1'))
        .rejects.toThrow('Service ID, User ID, and review content are required');
      
      await expect(community.submitReview('service-1', {}, 'user-1'))
        .rejects.toThrow('Review must include content');
    });

    it('should limit review length', async () => {
      const longContent = 'x'.repeat(6000);
      const review = { content: longContent };

      const result = await community.submitReview('service-1', review, 'user-5');

      expect(result.review.content).toHaveLength(5000);
    });

    it('should update rating if included', async () => {
      const review = {
        content: 'Good service',
        rating: 4
      };

      await community.submitReview('service-2', review, 'user-5');

      // Check that rating was also updated
      const ratingsCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('ratings.json')
      );
      expect(ratingsCall).toBeDefined();
    });
  });

  describe('getUsageAnalytics', () => {
    it('should return analytics summary', async () => {
      const analytics = await community.getUsageAnalytics('service-1');

      expect(analytics.serviceId).toBe('service-1');
      expect(analytics.summary.totalDownloads).toBe(100);
      expect(analytics.summary.totalViews).toBe(500);
      expect(analytics.summary.uniqueUsers).toBe(2);
      expect(analytics.summary.lastActivity).toBeDefined();
    });

    it('should calculate trends', async () => {
      const analytics = await community.getUsageAnalytics('service-1');

      expect(analytics.trends.daily).toHaveLength(7);
      expect(analytics.trends.weekly).toHaveLength(4);
      expect(analytics.trends.monthly).toHaveLength(3);
    });

    it('should return top actions', async () => {
      const analytics = await community.getUsageAnalytics('service-1');

      expect(analytics.topActions).toBeDefined();
      expect(analytics.topActions[0]).toEqual({
        action: 'download',
        count: 1
      });
    });

    it('should handle service without analytics', async () => {
      const analytics = await community.getUsageAnalytics('service-2');

      expect(analytics.summary.totalDownloads).toBe(0);
      expect(analytics.summary.totalViews).toBe(0);
      expect(analytics.summary.uniqueUsers).toBe(0);
    });

    it('should require service ID', async () => {
      await expect(community.getUsageAnalytics(null))
        .rejects.toThrow('Service ID is required');
    });
  });

  describe('getCommunityStats', () => {
    it('should return comprehensive statistics', async () => {
      const stats = await community.getCommunityStats('service-1');

      expect(stats.serviceId).toBe('service-1');
      expect(stats.ratings.average).toBe(4.3); // Rounded to 1 decimal
      expect(stats.ratings.count).toBe(4);
      expect(stats.reviews.total).toBe(1);
      expect(stats.engagement.downloads).toBe(100);
      expect(stats.engagement.views).toBe(500);
    });

    it('should calculate rating distribution', async () => {
      const stats = await community.getCommunityStats('service-1');

      expect(stats.ratings.distribution).toEqual({
        5: 1,
        4: 3,
        3: 0,
        2: 0,
        1: 0
      });
    });

    it('should calculate engagement score', async () => {
      const stats = await community.getCommunityStats('service-1');

      expect(stats.engagement.score).toBeGreaterThan(0);
      expect(stats.engagement.score).toBeLessThanOrEqual(100);
    });

    it('should include recent reviews', async () => {
      const stats = await community.getCommunityStats('service-1');

      expect(stats.reviews.recentReviews).toHaveLength(1);
      expect(stats.reviews.recentReviews[0].userId).toBe('user-1');
    });

    it('should handle service without data', async () => {
      const stats = await community.getCommunityStats('service-2');

      expect(stats.ratings.average).toBe(0);
      expect(stats.ratings.count).toBe(0);
      expect(stats.reviews.total).toBe(0);
      expect(stats.engagement.score).toBe(0);
    });
  });

  describe('private methods', () => {
    it('should track events with time aggregations', async () => {
      await community._trackEvent('service-1', 'download', { userId: 'user-5' });

      const analyticsCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('analytics.json')
      );
      const data = JSON.parse(analyticsCall[1]);
      
      expect(data['service-1'].downloads).toBe(101);
      expect(data['service-1'].events).toHaveLength(3);
      
      // Check time aggregations
      const today = new Date().toISOString().split('T')[0];
      expect(data['service-1'].daily[today]).toBeDefined();
      expect(data['service-1'].daily[today].downloads).toBeGreaterThan(0);
    });

    it('should calculate week number correctly', () => {
      const date1 = new Date('2025-01-01'); // First week
      const date2 = new Date('2025-12-31'); // Last week
      
      const week1 = community._getWeekNumber(date1);
      const week2 = community._getWeekNumber(date2);
      
      expect(week1).toBe(1);
      expect(week2).toBeGreaterThan(50);
    });

    it('should calculate engagement score', () => {
      const metrics = {
        downloads: 100,
        views: 1000,
        ratings: 10,
        reviews: 5
      };

      const score = community._calculateEngagementScore(metrics);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should calculate growth rate', () => {
      const analytics = {
        monthly: {
          '2025-01': { downloads: 100 },
          '2024-12': { downloads: 80 }
        }
      };

      const growthRate = community._calculateGrowthRate(analytics);
      expect(growthRate).toBe(25); // 25% growth
    });

    it('should handle zero previous downloads in growth rate', () => {
      const analytics = {
        monthly: {
          '2025-01': { downloads: 100 },
          '2024-12': { downloads: 0 }
        }
      };

      const growthRate = community._calculateGrowthRate(analytics);
      expect(growthRate).toBe(0);
    });
  });

  describe('initialization', () => {
    it('should create data directory and files', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));
      
      await community.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data/community'),
        { recursive: true }
      );
      
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // ratings, reviews, analytics
    });

    it('should not overwrite existing files', async () => {
      fs.access.mockResolvedValue(); // Files exist
      
      await community.initialize();

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});