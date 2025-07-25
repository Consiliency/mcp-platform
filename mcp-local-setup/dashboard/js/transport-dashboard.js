// Transport Dashboard JavaScript
// Handles real-time updates, server control, and metrics visualization

// Configuration
const API_BASE_URL = window.location.origin;
const WS_URL = `ws://${window.location.host}/ws`;
const UPDATE_INTERVAL = 5000; // 5 seconds

// Global state
let websocket = null;
let servers = [];
let metrics = {
    requests: [],
    connections: [],
    latencies: []
};
let charts = {};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    initializeCharts();
    loadServers();
    startMetricsPolling();
});

// WebSocket connection for real-time updates
function initializeWebSocket() {
    const statusEl = document.getElementById('wsStatus');
    const statusTextEl = document.getElementById('wsStatusText');
    
    try {
        websocket = new WebSocket(WS_URL);
        
        websocket.onopen = () => {
            statusEl.classList.add('connected');
            statusTextEl.textContent = 'Connected';
            console.log('WebSocket connected');
        };
        
        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleRealtimeUpdate(data);
        };
        
        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusEl.classList.add('error');
            statusTextEl.textContent = 'Error';
        };
        
        websocket.onclose = () => {
            statusEl.classList.remove('connected');
            statusEl.classList.remove('error');
            statusTextEl.textContent = 'Disconnected';
            // Attempt reconnection after 5 seconds
            setTimeout(initializeWebSocket, 5000);
        };
    } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        // Fall back to polling
    }
}

// Handle real-time updates from WebSocket
function handleRealtimeUpdate(data) {
    switch (data.type) {
        case 'server_status':
            updateServerStatus(data.serverId, data.status);
            break;
        case 'metrics_update':
            updateMetrics(data.metrics);
            break;
        case 'connection_update':
            updateConnectionCounts(data.connections);
            break;
    }
}

// Load servers from API
async function loadServers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/gateway/servers`);
        if (!response.ok) throw new Error('Failed to fetch servers');
        
        servers = await response.json();
        renderServers();
        updateTransportCounts();
    } catch (error) {
        console.error('Error loading servers:', error);
        showError('Failed to load servers');
    }
}

// Render server grid
function renderServers() {
    const grid = document.getElementById('serversGrid');
    const transportFilter = document.getElementById('transportFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    // Filter servers
    const filteredServers = servers.filter(server => {
        if (transportFilter && server.transport !== transportFilter) return false;
        if (statusFilter && server.status !== statusFilter) return false;
        return true;
    });
    
    if (filteredServers.length === 0) {
        grid.innerHTML = '<div class="loading">No servers found</div>';
        return;
    }
    
    grid.innerHTML = filteredServers.map(server => `
        <div class="server-card" data-server-id="${server.id}">
            <div class="server-header">
                <div class="server-info">
                    <h3>${server.name}</h3>
                    <div class="server-transport">
                        <span class="transport-badge ${server.transport}">${server.transport.toUpperCase()}</span>
                    </div>
                </div>
                <div class="server-status">
                    <span class="status-badge ${server.status}"></span>
                    ${server.status}
                </div>
            </div>
            <div class="server-details">
                ${server.connectionId ? `
                    <div class="detail-row">
                        <span>Connection ID:</span>
                        <span>${server.connectionId.substring(0, 8)}...</span>
                    </div>
                ` : ''}
                ${server.metrics ? `
                    <div class="detail-row">
                        <span>Requests:</span>
                        <span>${server.metrics.requests || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span>Avg Response:</span>
                        <span>${server.metrics.avgResponseTime || 0}ms</span>
                    </div>
                ` : ''}
                ${server.uptime ? `
                    <div class="detail-row">
                        <span>Uptime:</span>
                        <span>${formatUptime(server.uptime)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="server-actions">
                ${server.status === 'stopped' ? `
                    <button class="btn btn-primary btn-sm" onclick="startServer('${server.id}')">
                        Start
                    </button>
                ` : ''}
                ${server.status === 'running' ? `
                    <button class="btn btn-danger btn-sm" onclick="stopServer('${server.id}')">
                        Stop
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="restartServer('${server.id}')">
                        Restart
                    </button>
                ` : ''}
                <button class="btn btn-secondary btn-sm" onclick="showServerDetails('${server.id}')">
                    Details
                </button>
            </div>
        </div>
    `).join('');
}

// Update transport counts
function updateTransportCounts() {
    const transportCounts = {
        stdio: { active: 0, total: 0 },
        http: { active: 0, total: 0 },
        websocket: { active: 0, total: 0 }
    };
    
    servers.forEach(server => {
        const transport = server.transport;
        if (transportCounts[transport]) {
            transportCounts[transport].total++;
            if (server.status === 'running') {
                transportCounts[transport].active++;
            }
        }
    });
    
    // Update UI
    Object.keys(transportCounts).forEach(transport => {
        const activeEl = document.getElementById(`${transport}-active`);
        const totalEl = document.getElementById(`${transport}-total`);
        if (activeEl) activeEl.textContent = transportCounts[transport].active;
        if (totalEl) totalEl.textContent = transportCounts[transport].total;
    });
}

// Server control functions
async function startServer(serverId) {
    try {
        const button = event.target;
        button.disabled = true;
        
        const response = await fetch(`${API_BASE_URL}/api/gateway/servers/${serverId}/start`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to start server');
        
        const result = await response.json();
        if (result.success) {
            showSuccess(`Server ${serverId} started successfully`);
            await loadServers();
        } else {
            showError(result.message || 'Failed to start server');
        }
    } catch (error) {
        console.error('Error starting server:', error);
        showError('Failed to start server');
    }
}

async function stopServer(serverId) {
    try {
        const button = event.target;
        button.disabled = true;
        
        const response = await fetch(`${API_BASE_URL}/api/gateway/servers/${serverId}/stop`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('Failed to stop server');
        
        const result = await response.json();
        if (result.success) {
            showSuccess(`Server ${serverId} stopped successfully`);
            await loadServers();
        } else {
            showError(result.message || 'Failed to stop server');
        }
    } catch (error) {
        console.error('Error stopping server:', error);
        showError('Failed to stop server');
    }
}

async function restartServer(serverId) {
    try {
        const button = event.target;
        button.disabled = true;
        
        // Stop then start
        await stopServer(serverId);
        setTimeout(() => startServer(serverId), 1000);
    } catch (error) {
        console.error('Error restarting server:', error);
        showError('Failed to restart server');
    }
}

// Show server details in modal
async function showServerDetails(serverId) {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;
    
    const modal = document.getElementById('serverModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = server.name;
    
    // Fetch detailed info
    try {
        const response = await fetch(`${API_BASE_URL}/api/gateway/servers/${serverId}`);
        const details = await response.json();
        
        modalBody.innerHTML = `
            <div class="server-details-full">
                <h4>Configuration</h4>
                <pre>${JSON.stringify(details.config, null, 2)}</pre>
                
                <h4>Status Information</h4>
                <div class="detail-row">
                    <span>Status:</span>
                    <span>${details.status}</span>
                </div>
                <div class="detail-row">
                    <span>Transport:</span>
                    <span>${details.transport}</span>
                </div>
                ${details.connectionId ? `
                    <div class="detail-row">
                        <span>Connection ID:</span>
                        <span>${details.connectionId}</span>
                    </div>
                ` : ''}
                
                <h4>Metrics</h4>
                <pre>${JSON.stringify(details.metrics, null, 2)}</pre>
                
                <h4>Capabilities</h4>
                <pre>${JSON.stringify(details.capabilities, null, 2)}</pre>
            </div>
        `;
    } catch (error) {
        modalBody.innerHTML = '<p>Failed to load server details</p>';
    }
    
    modal.classList.add('active');
}

// Close modal
function closeModal() {
    const modal = document.getElementById('serverModal');
    modal.classList.remove('active');
}

// Filter servers
function filterServers() {
    renderServers();
}

// Refresh all data
async function refreshAll() {
    await loadServers();
    await updateMetricsData();
}

// Initialize charts
function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                grid: {
                    color: '#333'
                },
                ticks: {
                    color: '#9ca3af'
                }
            },
            y: {
                grid: {
                    color: '#333'
                },
                ticks: {
                    color: '#9ca3af'
                }
            }
        }
    };
    
    // Requests per second chart
    const rpsCtx = document.getElementById('rpsChart').getContext('2d');
    charts.rps = new Chart(rpsCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Requests/sec',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4
            }]
        },
        options: chartOptions
    });
    
    // Active connections chart
    const connectionsCtx = document.getElementById('connectionsChart').getContext('2d');
    charts.connections = new Chart(connectionsCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Connections',
                data: [],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4
            }]
        },
        options: chartOptions
    });
    
    // Transport distribution chart
    const transportCtx = document.getElementById('transportChart').getContext('2d');
    charts.transport = new Chart(transportCtx, {
        type: 'doughnut',
        data: {
            labels: ['STDIO', 'HTTP', 'WebSocket'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(236, 72, 153, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af'
                    }
                }
            }
        }
    });
    
    // Response times chart
    const latencyCtx = document.getElementById('latencyChart').getContext('2d');
    charts.latency = new Chart(latencyCtx, {
        type: 'bar',
        data: {
            labels: ['STDIO', 'HTTP', 'WebSocket'],
            datasets: [{
                label: 'Avg Response Time (ms)',
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(236, 72, 153, 0.8)'
                ]
            }]
        },
        options: chartOptions
    });
}

// Start metrics polling
function startMetricsPolling() {
    updateMetricsData();
    setInterval(updateMetricsData, UPDATE_INTERVAL);
}

// Update metrics data
async function updateMetricsData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/gateway/metrics`);
        if (!response.ok) throw new Error('Failed to fetch metrics');
        
        const data = await response.json();
        updateMetrics(data);
    } catch (error) {
        console.error('Error fetching metrics:', error);
    }
}

// Update metrics charts
function updateMetrics(data) {
    const now = new Date().toLocaleTimeString();
    
    // Update RPS chart
    if (charts.rps) {
        const rpsData = charts.rps.data;
        rpsData.labels.push(now);
        rpsData.datasets[0].data.push(data.requests_per_second || 0);
        
        // Keep last 20 data points
        if (rpsData.labels.length > 20) {
            rpsData.labels.shift();
            rpsData.datasets[0].data.shift();
        }
        charts.rps.update();
    }
    
    // Update connections chart
    if (charts.connections) {
        const connData = charts.connections.data;
        connData.labels.push(now);
        connData.datasets[0].data.push(data.active_connections || 0);
        
        if (connData.labels.length > 20) {
            connData.labels.shift();
            connData.datasets[0].data.shift();
        }
        charts.connections.update();
    }
    
    // Update transport distribution
    if (charts.transport && data.requests_per_transport) {
        charts.transport.data.datasets[0].data = [
            data.requests_per_transport.stdio || 0,
            data.requests_per_transport.http || 0,
            data.requests_per_transport.websocket || 0
        ];
        charts.transport.update();
    }
    
    // Update latency chart
    if (charts.latency && data.avg_response_times) {
        charts.latency.data.datasets[0].data = [
            data.avg_response_times.stdio || 0,
            data.avg_response_times.http || 0,
            data.avg_response_times.websocket || 0
        ];
        charts.latency.update();
    }
}

// Update server status from real-time update
function updateServerStatus(serverId, status) {
    const serverCard = document.querySelector(`[data-server-id="${serverId}"]`);
    if (!serverCard) return;
    
    const statusBadge = serverCard.querySelector('.status-badge');
    const statusText = serverCard.querySelector('.server-status').lastChild;
    
    statusBadge.className = `status-badge ${status}`;
    statusText.textContent = status;
    
    // Update server in memory
    const server = servers.find(s => s.id === serverId);
    if (server) {
        server.status = status;
    }
    
    // Re-render if filters are active
    const transportFilter = document.getElementById('transportFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    if (transportFilter || statusFilter) {
        renderServers();
    }
    
    updateTransportCounts();
}

// Update connection counts
function updateConnectionCounts(connections) {
    // Update transport cards with new connection data
    Object.keys(connections).forEach(transport => {
        const activeEl = document.getElementById(`${transport}-active`);
        if (activeEl) {
            activeEl.textContent = connections[transport];
        }
    });
}

// Utility functions
function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

function showError(message) {
    // TODO: Implement toast notifications
    console.error(message);
}

function showSuccess(message) {
    // TODO: Implement toast notifications
    console.log(message);
}

// Handle page visibility for WebSocket
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, close WebSocket to save resources
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close();
        }
    } else {
        // Page is visible again, reconnect
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            initializeWebSocket();
        }
        // Refresh data
        refreshAll();
    }
});