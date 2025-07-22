/**
 * Unit tests for NetworkManager and related components
 */

const NetworkManager = require('../../../security/network/network-manager');
const RateLimiter = require('../../../security/network/rate-limiter');
const CORSManager = require('../../../security/network/cors-manager');
const ServiceIsolation = require('../../../security/network/service-isolation');

describe('NetworkManager', () => {
    let networkManager;

    beforeEach(async () => {
        networkManager = new NetworkManager();
        await networkManager.initialize();
    });

    afterEach(async () => {
        await networkManager.cleanup();
    });

    it('should initialize all components', () => {
        expect(networkManager.rateLimiter).toBeInstanceOf(RateLimiter);
        expect(networkManager.corsManager).toBeInstanceOf(CORSManager);
        expect(networkManager.serviceIsolation).toBeInstanceOf(ServiceIsolation);
    });
});

describe('RateLimiter', () => {
    let rateLimiter;

    beforeEach(async () => {
        rateLimiter = new RateLimiter();
        await rateLimiter.initialize();
    });

    afterEach(async () => {
        await rateLimiter.cleanup();
    });

    describe('getStatus', () => {
        it('should track request count', async () => {
            const identifier = 'test-client';

            const status1 = await rateLimiter.getStatus(identifier);
            expect(status1.remaining).toBe(59); // 60 - 1

            const status2 = await rateLimiter.getStatus(identifier);
            expect(status2.remaining).toBe(58); // 60 - 2
        });

        it('should enforce rate limits', async () => {
            const identifier = 'test-burst-client';

            // Make requests up to the limit
            for (let i = 0; i < 60; i++) {
                await rateLimiter.getStatus(identifier);
            }

            const status = await rateLimiter.getStatus(identifier);
            expect(status.exceeded).toBe(true);
            expect(status.remaining).toBe(0);
        });

        it('should whitelist exempt identifiers', async () => {
            await rateLimiter.setRules({
                requestsPerMinute: 60,
                whitelist: ['127.0.0.1']
            });

            // Make many requests from whitelisted IP
            for (let i = 0; i < 100; i++) {
                await rateLimiter.getStatus('127.0.0.1');
            }

            const status = await rateLimiter.getStatus('127.0.0.1');
            expect(status.exceeded).toBe(false);
            expect(status.remaining).toBe(60);
        });

        it('should reset after time window', async () => {
            jest.useFakeTimers();
            const identifier = 'test-reset-client';

            // Use up the limit
            for (let i = 0; i < 60; i++) {
                await rateLimiter.getStatus(identifier);
            }

            let status = await rateLimiter.getStatus(identifier);
            expect(status.exceeded).toBe(true);

            // Advance time by 1 minute
            jest.advanceTimersByTime(60000);

            status = await rateLimiter.getStatus(identifier);
            expect(status.exceeded).toBe(false);
            expect(status.remaining).toBe(59);

            jest.useRealTimers();
        });
    });

    describe('middleware', () => {
        it('should set rate limit headers', async () => {
            const middleware = rateLimiter.getMiddleware();
            const req = { ip: '192.168.1.1' };
            const res = {
                headers: {},
                set: function(headers) {
                    Object.assign(this.headers, headers);
                }
            };
            const next = jest.fn();

            await middleware(req, res, next);

            expect(res.headers['X-RateLimit-Limit']).toBe(60);
            expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
            expect(res.headers['X-RateLimit-Reset']).toBeDefined();
            expect(next).toHaveBeenCalled();
        });

        it('should return 429 when rate limit exceeded', async () => {
            const middleware = rateLimiter.getMiddleware();
            const req = { ip: '192.168.1.2' };
            const res = {
                headers: {},
                set: jest.fn(),
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            const next = jest.fn();

            // Exhaust rate limit
            for (let i = 0; i < 60; i++) {
                await rateLimiter.getStatus('ip:192.168.1.2');
            }

            await middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Rate limit exceeded'
            }));
            expect(next).not.toHaveBeenCalled();
        });
    });
});

describe('CORSManager', () => {
    let corsManager;

    beforeEach(async () => {
        corsManager = new CORSManager();
        await corsManager.initialize();
    });

    afterEach(async () => {
        await corsManager.cleanup();
    });

    describe('configure', () => {
        it('should update CORS policy', async () => {
            const newPolicy = {
                origins: ['https://example.com'],
                methods: ['GET', 'POST'],
                headers: ['Content-Type']
            };

            await corsManager.configure(newPolicy);
            const policy = corsManager.getPolicy();

            expect(policy.origins).toContain('https://example.com');
            expect(policy.methods).toContain('GET');
            expect(policy.methods).toContain('POST');
        });
    });

    describe('isOriginAllowed', () => {
        it('should allow exact origin match', () => {
            corsManager.policy.origins = ['https://example.com'];
            expect(corsManager.isOriginAllowed('https://example.com')).toBe(true);
            expect(corsManager.isOriginAllowed('https://other.com')).toBe(false);
        });

        it('should handle wildcard origins', () => {
            corsManager.policy.origins = ['*'];
            expect(corsManager.isOriginAllowed('https://any-domain.com')).toBe(true);
        });

        it('should handle wildcard subdomain patterns', () => {
            corsManager.policy.origins = ['*.example.com'];
            expect(corsManager.isOriginAllowed('https://api.example.com')).toBe(true);
            expect(corsManager.isOriginAllowed('https://app.example.com')).toBe(true);
            expect(corsManager.isOriginAllowed('https://example.com')).toBe(false);
        });
    });

    describe('middleware', () => {
        it('should set CORS headers for allowed origins', () => {
            const middleware = corsManager.getMiddleware();
            const req = {
                headers: { origin: 'http://localhost:3000' },
                method: 'GET'
            };
            const res = {
                headers: {},
                set: function(headers) {
                    Object.assign(this.headers, headers);
                }
            };
            const next = jest.fn();

            middleware(req, res, next);

            expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
            expect(res.headers['Access-Control-Allow-Credentials']).toBe(true);
            expect(next).toHaveBeenCalled();
        });

        it('should handle preflight requests', () => {
            const middleware = corsManager.getMiddleware();
            const req = {
                headers: { origin: 'http://localhost:3000' },
                method: 'OPTIONS'
            };
            const res = {
                headers: {},
                set: function(headers) {
                    Object.assign(this.headers, headers);
                },
                sendStatus: jest.fn()
            };
            const next = jest.fn();

            middleware(req, res, next);

            expect(res.headers['Access-Control-Allow-Methods']).toBeDefined();
            expect(res.headers['Access-Control-Allow-Headers']).toBeDefined();
            expect(res.sendStatus).toHaveBeenCalledWith(204);
            expect(next).not.toHaveBeenCalled();
        });
    });
});

describe('ServiceIsolation', () => {
    let serviceIsolation;

    beforeEach(async () => {
        serviceIsolation = new ServiceIsolation();
        await serviceIsolation.initialize();
    });

    afterEach(async () => {
        await serviceIsolation.cleanup();
    });

    describe('isolation rules', () => {
        it('should add and check isolation rules', async () => {
            await serviceIsolation.addRule({
                source: 'service-a',
                target: 'service-b',
                allowed: true,
                methods: ['GET', 'POST']
            });

            const allowed = await serviceIsolation.isAllowed('service-a', 'service-b');
            expect(allowed).toBe(true);

            const notAllowed = await serviceIsolation.isAllowed('service-b', 'service-a');
            expect(notAllowed).toBe(false); // Default deny policy
        });

        it('should validate rule options', async () => {
            await serviceIsolation.addRule({
                source: 'service-a',
                target: 'service-b',
                allowed: true,
                protocols: ['https'],
                methods: ['GET']
            });

            const httpsAllowed = await serviceIsolation.isAllowed('service-a', 'service-b', {
                protocol: 'https',
                method: 'GET'
            });
            expect(httpsAllowed).toBe(true);

            const httpNotAllowed = await serviceIsolation.isAllowed('service-a', 'service-b', {
                protocol: 'http',
                method: 'GET'
            });
            expect(httpNotAllowed).toBe(false);
        });

        it('should handle wildcard rules', async () => {
            await serviceIsolation.addRule({
                source: 'admin-service',
                target: '*',
                allowed: true
            });

            const allowed = await serviceIsolation.isAllowed('admin-service', 'any-service');
            expect(allowed).toBe(true);
        });

        it('should have default rules for health service', async () => {
            const healthToService = await serviceIsolation.isAllowed('health-service', 'any-service');
            expect(healthToService).toBe(true);

            const serviceToHealth = await serviceIsolation.isAllowed('any-service', 'health-service');
            expect(serviceToHealth).toBe(true);
        });
    });

    describe('rule management', () => {
        it('should remove rules', async () => {
            await serviceIsolation.addRule({
                source: 'service-a',
                target: 'service-b',
                allowed: true
            });

            let allowed = await serviceIsolation.isAllowed('service-a', 'service-b');
            expect(allowed).toBe(true);

            await serviceIsolation.removeRule('service-a', 'service-b');

            allowed = await serviceIsolation.isAllowed('service-a', 'service-b');
            expect(allowed).toBe(false);
        });

        it('should get all rules', async () => {
            await serviceIsolation.addRule({
                source: 'service-a',
                target: 'service-b',
                allowed: true
            });

            const rules = await serviceIsolation.getRules();
            const customRule = rules.find(r => r.source === 'service-a' && r.target === 'service-b');
            
            expect(customRule).toBeDefined();
            expect(customRule.allowed).toBe(true);
        });
    });
});