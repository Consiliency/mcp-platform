# MCP Transport Dashboard

A web-based dashboard for monitoring and managing MCP (Model Context Protocol) servers across different transport types.

## Features

### Transport Overview (`/transport.html`)
- **Real-time Transport Status**: View active connections and server status for STDIO, HTTP, and WebSocket transports
- **Server Management**: Start, stop, and restart MCP servers with a single click
- **Live Metrics**: Monitor requests per second, active connections, and response times
- **Transport Distribution**: Visualize server distribution across different transport types

### Metrics Dashboard (`/metrics.html`)
- **Performance Metrics**: Track request rates, success rates, and response times
- **Transport Breakdown**: Detailed performance analysis for each transport type
- **Error Analysis**: Monitor error rates and view recent errors with details
- **Server Performance Table**: Compare performance metrics across all servers

### Health Monitor (`/health/`)
- **System Overview**: Overall system health status and service counts
- **Service Health**: Individual service health checks and response times
- **Auto-refresh**: Updates every 30 seconds or manually refresh

## Architecture

The dashboard is built with:
- **Vanilla JavaScript**: No framework dependencies for lightweight performance
- **Chart.js**: For rich data visualizations
- **WebSocket**: Real-time updates for live monitoring
- **Responsive Design**: Works on desktop and mobile devices

## File Structure

```
dashboard/
├── index.html           # Main services dashboard
├── transport.html       # Transport overview and server management
├── metrics.html         # Detailed metrics and analytics
├── health/
│   └── index.html      # Health monitoring dashboard
├── css/
│   ├── transport-dashboard.css   # Transport dashboard styles
│   └── metrics-dashboard.css     # Metrics dashboard styles
└── js/
    ├── transport-dashboard.js    # Transport dashboard logic
    ├── metrics-dashboard.js      # Metrics dashboard logic
    └── mock-data.js             # Mock data for testing
```

## Mock Data

When running locally without a backend, the dashboard automatically uses mock data to demonstrate functionality. This includes:
- 6 sample MCP servers across different transports
- Simulated real-time metrics
- WebSocket updates for live data
- Realistic error scenarios

## API Integration

The dashboard integrates with the MCP API Gateway endpoints:

- `GET /api/gateway/servers` - List all servers
- `POST /api/gateway/servers/{id}/start` - Start a server
- `POST /api/gateway/servers/{id}/stop` - Stop a server
- `GET /api/gateway/servers/{id}` - Get server details
- `GET /api/gateway/metrics` - Get system metrics
- `GET /health` - System health status
- `GET /health/services` - Individual service health

## WebSocket Events

The dashboard listens for real-time updates via WebSocket:

```javascript
{
  type: 'server_status',
  serverId: 'server-id',
  status: 'running|stopped|error'
}

{
  type: 'metrics_update',
  metrics: {
    requests_per_second: 5.7,
    active_connections: 4
  }
}
```

## Customization

### Adding New Transport Types

1. Update the transport cards in `transport.html`
2. Add transport-specific colors in CSS variables
3. Update mock data to include the new transport

### Modifying Charts

Charts are configured in the respective JavaScript files. To modify:

1. Locate the chart initialization in `initializeCharts()`
2. Update chart options or data structure
3. Modify the update functions to handle new data

## Usage

1. Open `transport.html` for the main transport overview
2. Click on server cards to view details
3. Use the control buttons to manage server lifecycle
4. Navigate to metrics dashboard for detailed analytics
5. Monitor system health from the health dashboard

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Android)

## Performance

- Lightweight: < 100KB total (excluding Chart.js)
- Efficient updates: Only modified DOM elements are updated
- WebSocket connection management: Automatically reconnects
- Responsive charts: Optimized for smooth animations