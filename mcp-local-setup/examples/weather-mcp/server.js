const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const NodeCache = require('node-cache');
const Joi = require('joi');
const MCPServiceInterface = require('../../interfaces/mcp-service.interface');
const { createHealthStatus, HealthStatusEnum, calculateOverallHealth } = require('../../interfaces/health-status.interface');

// Validation schemas
const locationSchema = Joi.alternatives().try(
    Joi.string().min(2).max(100), // City name
    Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lon: Joi.number().min(-180).max(180).required()
    })
);

class WeatherMCPService extends MCPServiceInterface {
    constructor(config) {
        super(config);
        this.app = express();
        this.startTime = Date.now();
        
        // Initialize cache with 5-minute TTL by default
        this.cache = new NodeCache({ 
            stdTTL: parseInt(process.env.CACHE_TTL || 300),
            checkperiod: 120,
            useClones: false
        });
        
        // Mock weather API configuration
        this.weatherApiEnabled = process.env.WEATHER_API_KEY ? true : false;
        this.weatherApiKey = process.env.WEATHER_API_KEY;
        this.weatherApiUrl = process.env.WEATHER_API_URL || 'https://api.openweathermap.org/data/2.5';
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupCacheEvents();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(morgan('combined'));
    }

    setupCacheEvents() {
        this.cache.on('set', (key, value) => {
            console.log(`Cache SET: ${key}`);
        });

        this.cache.on('del', (key, value) => {
            console.log(`Cache DEL: ${key}`);
        });

        this.cache.on('expired', (key, value) => {
            console.log(`Cache EXPIRED: ${key}`);
        });
    }

    // Generate mock weather data
    generateMockWeather(location) {
        const temps = [15, 18, 20, 22, 25, 28, 30];
        const conditions = ['Clear', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Rain', 'Thunderstorm'];
        const windDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        
        return {
            location: typeof location === 'string' ? location : `${location.lat},${location.lon}`,
            timestamp: new Date().toISOString(),
            current: {
                temperature: temps[Math.floor(Math.random() * temps.length)],
                feels_like: temps[Math.floor(Math.random() * temps.length)],
                humidity: 40 + Math.floor(Math.random() * 40),
                pressure: 1000 + Math.floor(Math.random() * 30),
                condition: conditions[Math.floor(Math.random() * conditions.length)],
                wind: {
                    speed: Math.floor(Math.random() * 20),
                    direction: windDirections[Math.floor(Math.random() * windDirections.length)]
                },
                visibility: 5 + Math.floor(Math.random() * 10),
                uv_index: Math.floor(Math.random() * 11)
            },
            forecast: this.generateForecast()
        };
    }

    generateForecast() {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Stormy'];
        
        return days.map((day, index) => ({
            day,
            date: new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            high: 20 + Math.floor(Math.random() * 10),
            low: 10 + Math.floor(Math.random() * 10),
            condition: conditions[Math.floor(Math.random() * conditions.length)],
            precipitation_chance: Math.floor(Math.random() * 100)
        }));
    }

    // Fetch real weather data (when API key is provided)
    async fetchRealWeather(location) {
        try {
            let params = {
                appid: this.weatherApiKey,
                units: 'metric'
            };

            if (typeof location === 'string') {
                params.q = location;
            } else {
                params.lat = location.lat;
                params.lon = location.lon;
            }

            const response = await axios.get(`${this.weatherApiUrl}/weather`, { params });
            const data = response.data;

            return {
                location: data.name || `${data.coord.lat},${data.coord.lon}`,
                timestamp: new Date().toISOString(),
                current: {
                    temperature: data.main.temp,
                    feels_like: data.main.feels_like,
                    humidity: data.main.humidity,
                    pressure: data.main.pressure,
                    condition: data.weather[0].main,
                    description: data.weather[0].description,
                    wind: {
                        speed: data.wind.speed,
                        direction: this.degreeToDirection(data.wind.deg)
                    },
                    visibility: data.visibility / 1000, // Convert to km
                    clouds: data.clouds.all
                },
                coordinates: {
                    lat: data.coord.lat,
                    lon: data.coord.lon
                },
                sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
                sunset: new Date(data.sys.sunset * 1000).toISOString()
            };
        } catch (error) {
            console.error('Failed to fetch real weather:', error.message);
            throw error;
        }
    }

    degreeToDirection(degree) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(degree / 45) % 8;
        return directions[index];
    }

    setupRoutes() {
        // Health endpoint
        this.app.get('/health', async (req, res) => {
            const health = await this.health();
            res.status(health.status === HealthStatusEnum.HEALTHY ? 200 : 503).json(health);
        });

        // Service info
        this.app.get('/', (req, res) => {
            res.json({
                ...this.getManifest(),
                cache_enabled: true,
                cache_ttl: this.cache.options.stdTTL,
                real_api_enabled: this.weatherApiEnabled
            });
        });

        // Get weather for location
        this.app.get('/weather/:location', async (req, res) => {
            try {
                const { error } = locationSchema.validate(req.params.location);
                if (error) {
                    return res.status(400).json({ error: error.details[0].message });
                }

                const location = req.params.location;
                const forceRefresh = req.query.refresh === 'true';
                const cacheKey = `weather:${location}`;

                // Check cache first (unless force refresh)
                if (!forceRefresh) {
                    const cached = this.cache.get(cacheKey);
                    if (cached) {
                        console.log(`Cache HIT for ${location}`);
                        return res.json({
                            ...cached,
                            cached: true,
                            cache_ttl: this.cache.getTtl(cacheKey)
                        });
                    }
                }

                console.log(`Cache MISS for ${location}`);

                // Fetch weather data
                let weatherData;
                if (this.weatherApiEnabled) {
                    try {
                        weatherData = await this.fetchRealWeather(location);
                    } catch (error) {
                        // Fall back to mock data if real API fails
                        console.log('Falling back to mock data due to API error');
                        weatherData = this.generateMockWeather(location);
                        weatherData.mock = true;
                    }
                } else {
                    weatherData = this.generateMockWeather(location);
                    weatherData.mock = true;
                }

                // Cache the result
                this.cache.set(cacheKey, weatherData);

                res.json({
                    ...weatherData,
                    cached: false
                });
            } catch (error) {
                console.error('Error fetching weather:', error);
                res.status(500).json({ error: 'Failed to fetch weather data' });
            }
        });

        // Get weather by coordinates
        this.app.get('/weather/coords/:lat/:lon', async (req, res) => {
            try {
                const lat = parseFloat(req.params.lat);
                const lon = parseFloat(req.params.lon);

                const { error } = locationSchema.validate({ lat, lon });
                if (error) {
                    return res.status(400).json({ error: 'Invalid coordinates' });
                }

                const location = { lat, lon };
                const forceRefresh = req.query.refresh === 'true';
                const cacheKey = `weather:${lat},${lon}`;

                // Check cache first
                if (!forceRefresh) {
                    const cached = this.cache.get(cacheKey);
                    if (cached) {
                        console.log(`Cache HIT for coordinates ${lat},${lon}`);
                        return res.json({
                            ...cached,
                            cached: true,
                            cache_ttl: this.cache.getTtl(cacheKey)
                        });
                    }
                }

                console.log(`Cache MISS for coordinates ${lat},${lon}`);

                // Fetch weather data
                let weatherData;
                if (this.weatherApiEnabled) {
                    try {
                        weatherData = await this.fetchRealWeather(location);
                    } catch (error) {
                        weatherData = this.generateMockWeather(location);
                        weatherData.mock = true;
                    }
                } else {
                    weatherData = this.generateMockWeather(location);
                    weatherData.mock = true;
                }

                // Cache the result
                this.cache.set(cacheKey, weatherData);

                res.json({
                    ...weatherData,
                    cached: false
                });
            } catch (error) {
                console.error('Error fetching weather:', error);
                res.status(500).json({ error: 'Failed to fetch weather data' });
            }
        });

        // Batch weather requests
        this.app.post('/weather/batch', async (req, res) => {
            try {
                const { locations } = req.body;
                if (!Array.isArray(locations) || locations.length === 0) {
                    return res.status(400).json({ error: 'Invalid locations array' });
                }

                if (locations.length > 10) {
                    return res.status(400).json({ error: 'Maximum 10 locations per batch' });
                }

                const results = await Promise.all(
                    locations.map(async (location) => {
                        try {
                            const cacheKey = typeof location === 'string' 
                                ? `weather:${location}` 
                                : `weather:${location.lat},${location.lon}`;
                            
                            // Check cache
                            const cached = this.cache.get(cacheKey);
                            if (cached) {
                                return { ...cached, cached: true };
                            }

                            // Fetch new data
                            let weatherData;
                            if (this.weatherApiEnabled) {
                                try {
                                    weatherData = await this.fetchRealWeather(location);
                                } catch (error) {
                                    weatherData = this.generateMockWeather(location);
                                    weatherData.mock = true;
                                }
                            } else {
                                weatherData = this.generateMockWeather(location);
                                weatherData.mock = true;
                            }

                            this.cache.set(cacheKey, weatherData);
                            return { ...weatherData, cached: false };
                        } catch (error) {
                            return { 
                                location, 
                                error: 'Failed to fetch weather', 
                                message: error.message 
                            };
                        }
                    })
                );

                res.json({ results });
            } catch (error) {
                console.error('Batch weather error:', error);
                res.status(500).json({ error: 'Failed to process batch request' });
            }
        });

        // Cache management endpoints
        this.app.get('/cache/stats', (req, res) => {
            const keys = this.cache.keys();
            const stats = {
                size: keys.length,
                keys: keys,
                memory_usage: this.cache.getStats(),
                ttl: this.cache.options.stdTTL
            };
            res.json(stats);
        });

        this.app.delete('/cache', (req, res) => {
            this.cache.flushAll();
            res.json({ message: 'Cache cleared', cleared: true });
        });

        this.app.delete('/cache/:key', (req, res) => {
            const deleted = this.cache.del(req.params.key);
            res.json({ 
                deleted: deleted > 0, 
                key: req.params.key 
            });
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ 
                error: 'Endpoint not found', 
                availableEndpoints: this.getEndpoints() 
            });
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({ 
                error: 'Internal server error', 
                message: err.message 
            });
        });
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`Weather MCP Service v${this.version} listening on port ${this.port}`);
                console.log(`Cache TTL: ${this.cache.options.stdTTL}s`);
                console.log(`Real API: ${this.weatherApiEnabled ? 'Enabled' : 'Disabled (using mock data)'}`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Weather MCP Service stopped');
                    this.cache.close();
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async health() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const cacheStats = this.cache.getStats();
        
        const checks = {
            service: 'healthy',
            cache: 'healthy',
            memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'unhealthy'
        };
        
        const issues = [];
        
        if (checks.memory === 'unhealthy') {
            issues.push('High memory usage');
        }
        
        if (cacheStats.misses > cacheStats.hits * 10) {
            checks.cache = 'unhealthy';
            issues.push('High cache miss rate');
        }
        
        const overallStatus = calculateOverallHealth(checks);
        
        return createHealthStatus(
            this.name,
            this.version,
            uptime,
            overallStatus,
            checks,
            issues
        );
    }

    getEndpoints() {
        return {
            '/': 'Service manifest and configuration',
            '/health': 'Health check endpoint',
            'GET /weather/:location': 'Get weather for a city',
            'GET /weather/coords/:lat/:lon': 'Get weather by coordinates',
            'POST /weather/batch': 'Get weather for multiple locations',
            'GET /cache/stats': 'Get cache statistics',
            'DELETE /cache': 'Clear entire cache',
            'DELETE /cache/:key': 'Delete specific cache entry'
        };
    }

    getCapabilities() {
        return ['weather', 'forecast', 'caching', 'batch-requests', 'coordinates'];
    }

    getRequirements() {
        return {
            env: [
                'CACHE_TTL - Cache time-to-live in seconds (default: 300)',
                'WEATHER_API_KEY - OpenWeatherMap API key (optional, uses mock data if not provided)',
                'WEATHER_API_URL - Weather API base URL (default: https://api.openweathermap.org/data/2.5)'
            ],
            dependencies: ['express', 'axios', 'node-cache', 'joi', 'cors', 'morgan']
        };
    }
}

// Start the service
if (require.main === module) {
    const config = {
        name: 'weather-mcp',
        version: '1.0.0',
        port: process.env.PORT || 3012,
        env: process.env
    };

    const service = new WeatherMCPService(config);
    
    service.start().catch(err => {
        console.error('Failed to start service:', err);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        await service.stop();
        process.exit(0);
    });
}

module.exports = WeatherMCPService;