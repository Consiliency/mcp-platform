# Weather MCP Service

A weather service that provides current weather data with intelligent caching. It can use real weather API data (when configured) or generate mock data for testing. The service implements an LRU cache to minimize API calls and improve response times.

## Features

- Current weather data by city name or coordinates
- Intelligent caching with configurable TTL
- Batch requests for multiple locations
- Mock data generation when API key not provided
- Real-time OpenWeatherMap integration (optional)
- Cache management endpoints
- Comprehensive error handling
- Health monitoring with cache statistics

## Installation

```bash
npm install
```

## Usage

### Running locally

```bash
# Default configuration (mock data, 5-minute cache)
npm start

# With real weather API
WEATHER_API_KEY=your_openweathermap_key npm start

# Custom cache TTL (in seconds)
CACHE_TTL=600 npm start

# Development mode
npm run dev
```

### Running with Docker

```bash
# Build the image
docker build -t weather-mcp .

# Run with mock data
docker run -p 3012:3012 weather-mcp

# Run with real API
docker run -p 3012:3012 \
  -e WEATHER_API_KEY=your_api_key \
  weather-mcp
```

## API Endpoints

### Service Information
```bash
GET /
```

Returns service manifest including cache configuration and API status.

### Health Check
```bash
GET /health
```

Returns health status including cache performance metrics.

### Get Weather by City
```bash
GET /weather/:location?refresh=true
```

Parameters:
- `location` - City name (e.g., "London", "New York")
- `refresh` - Force cache refresh (optional)

Example response:
```json
{
  "location": "London",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "current": {
    "temperature": 18,
    "feels_like": 16,
    "humidity": 65,
    "pressure": 1013,
    "condition": "Partly Cloudy",
    "wind": {
      "speed": 12,
      "direction": "SW"
    },
    "visibility": 10,
    "uv_index": 3
  },
  "forecast": [...],
  "cached": false,
  "mock": true
}
```

### Get Weather by Coordinates
```bash
GET /weather/coords/:lat/:lon?refresh=true
```

Parameters:
- `lat` - Latitude (-90 to 90)
- `lon` - Longitude (-180 to 180)
- `refresh` - Force cache refresh (optional)

### Batch Weather Request
```bash
POST /weather/batch
Content-Type: application/json

{
  "locations": [
    "London",
    "Paris",
    {"lat": 40.7128, "lon": -74.0060},
    "Tokyo"
  ]
}
```

Maximum 10 locations per request.

### Cache Statistics
```bash
GET /cache/stats
```

Returns cache information:
```json
{
  "size": 5,
  "keys": ["weather:London", "weather:Paris"],
  "memory_usage": {
    "hits": 45,
    "misses": 12,
    "keys": 5,
    "ksize": 120,
    "vsize": 4560
  },
  "ttl": 300
}
```

### Clear Cache
```bash
DELETE /cache
```

Clears all cached entries.

### Delete Cache Entry
```bash
DELETE /cache/:key
```

Deletes a specific cache entry.

## Examples

### Using curl

```bash
# Get weather for London
curl http://localhost:3012/weather/London

# Get weather by coordinates (New York)
curl http://localhost:3012/weather/coords/40.7128/-74.0060

# Force refresh (bypass cache)
curl "http://localhost:3012/weather/London?refresh=true"

# Batch request
curl -X POST http://localhost:3012/weather/batch \
  -H "Content-Type: application/json" \
  -d '{
    "locations": ["London", "Paris", "Berlin"]
  }'

# View cache statistics
curl http://localhost:3012/cache/stats

# Clear cache
curl -X DELETE http://localhost:3012/cache
```

### Using JavaScript

```javascript
// Get weather with caching
const response = await fetch('http://localhost:3012/weather/London');
const weather = await response.json();

if (weather.cached) {
  console.log('Data from cache, TTL:', weather.cache_ttl);
}

// Batch request
const batch = await fetch('http://localhost:3012/weather/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    locations: [
      'London',
      { lat: 48.8566, lon: 2.3522 }, // Paris
      'Tokyo'
    ]
  })
});
const results = await batch.json();

// Force refresh
const fresh = await fetch('http://localhost:3012/weather/London?refresh=true');
const freshData = await fresh.json();
```

## Environment Variables

- `PORT` - Server port (default: 3012)
- `CACHE_TTL` - Cache time-to-live in seconds (default: 300)
- `WEATHER_API_KEY` - OpenWeatherMap API key (optional)
- `WEATHER_API_URL` - Weather API base URL (default: https://api.openweathermap.org/data/2.5)
- `NODE_ENV` - Node environment (default: production)

## Caching Strategy

The service implements an intelligent caching strategy:
1. All weather data is cached with a configurable TTL
2. Cache keys are based on location (city name or coordinates)
3. Cache can be bypassed with `?refresh=true` parameter
4. Cache statistics help monitor performance
5. Automatic cache expiration and memory management

## Mock vs Real Data

- **Mock Data**: Used when no API key is provided. Generates realistic weather data for testing.
- **Real Data**: Used when `WEATHER_API_KEY` is set. Falls back to mock data on API errors.

Mock data includes:
- Randomized but realistic temperature ranges
- Various weather conditions
- 5-day forecast
- Wind, humidity, and other metrics

## Error Handling

The service handles various error scenarios:
- Invalid location/coordinates (400)
- API failures (falls back to mock data)
- Cache errors (logged, continues operation)
- Server errors (500)

## Performance Considerations

- Cache reduces API calls significantly
- Batch endpoint minimizes round trips
- Efficient memory usage with cache limits
- Health monitoring for cache performance
- Graceful degradation to mock data

## Development

The service extends `MCPServiceInterface` and implements:
- Advanced caching with node-cache
- Mock data generation
- Real API integration (optional)
- Batch processing
- Cache management
- Performance monitoring

## License

MIT