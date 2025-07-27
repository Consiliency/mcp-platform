// Metrics Dashboard JavaScript
// Advanced metrics visualization and analysis

// Configuration
const API_BASE_URL = window.location.origin;
const UPDATE_INTERVAL = 5000;

// Global state
let metricsData = {
    timeRange: '15m',
    requests: [],
    errors: [],
    responseDistribution: {},
    transportMetrics: {},
    serverMetrics: []
};

let charts = {};
let activeTransportTab = 'stdio';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeCharts();
    loadMetrics();
    startPolling();
    updateSummaryCards();
});

// Initialize all charts
function initializeCharts() {
    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
                labels: {
                    color: '#9ca3af'
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: '#333',
                    drawBorder: false
                },
                ticks: {
                    color: '#9ca3af'
                }
            },
            y: {
                grid: {
                    color: '#333',
                    drawBorder: false
                },
                ticks: {
                    color: '#9ca3af'
                }
            }
        }
    };

    // Request Rate Chart
    const requestRateCtx = document.getElementById('requestRateChart').getContext('2d');
    charts.requestRate = new Chart(requestRateCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Requests',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4
            }, {
                label: 'Errors',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                hidden: true
            }]
        },
        options: {
            ...chartDefaults,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                ...chartDefaults.plugins,
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#333',
                    borderWidth: 1
                }
            }
        }
    });

    // Response Distribution Chart
    const responseDistCtx = document.getElementById('responseDistChart').getContext('2d');
    charts.responseDistribution = new Chart(responseDistCtx, {
        type: 'bar',
        data: {
            labels: ['0-50ms', '50-100ms', '100-200ms', '200-500ms', '500ms+'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(34, 197, 94, 0.8)',
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(107, 114, 128, 0.8)'
                ]
            }]
        },
        options: {
            ...chartDefaults,
            scales: {
                ...chartDefaults.scales,
                y: {
                    ...chartDefaults.scales.y,
                    beginAtZero: true
                }
            }
        }
    });

    // Transport Performance Chart
    const transportPerfCtx = document.getElementById('transportPerfChart').getContext('2d');
    charts.transportPerformance = new Chart(transportPerfCtx, {
        type: 'radar',
        data: {
            labels: ['Requests', 'Success Rate', 'Avg Response', 'Throughput', 'Uptime'],
            datasets: [{
                label: 'STDIO',
                data: [0, 0, 0, 0, 0],
                borderColor: 'rgba(59, 130, 246, 0.8)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                pointBackgroundColor: 'rgba(59, 130, 246, 1)'
            }, {
                label: 'HTTP',
                data: [0, 0, 0, 0, 0],
                borderColor: 'rgba(139, 92, 246, 0.8)',
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                pointBackgroundColor: 'rgba(139, 92, 246, 1)'
            }, {
                label: 'WebSocket',
                data: [0, 0, 0, 0, 0],
                borderColor: 'rgba(236, 72, 153, 0.8)',
                backgroundColor: 'rgba(236, 72, 153, 0.2)',
                pointBackgroundColor: 'rgba(236, 72, 153, 1)'
            }]
        },
        options: {
            ...chartDefaults,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        padding: 15
                    }
                }
            },
            scales: {
                r: {
                    grid: {
                        color: '#333',
                        circular: true
                    },
                    angleLines: {
                        color: '#333'
                    },
                    ticks: {
                        color: '#9ca3af',
                        backdropColor: 'transparent'
                    },
                    pointLabels: {
                        color: '#9ca3af',
                        font: {
                            size: 11
                        }
                    },
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });

    // Error Type Chart
    const errorTypeCtx = document.getElementById('errorTypeChart').getContext('2d');
    charts.errorType = new Chart(errorTypeCtx, {
        type: 'doughnut',
        data: {
            labels: ['Timeout', 'Connection', 'Server Error', 'Client Error', 'Other'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(236, 72, 153, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(107, 114, 128, 0.8)'
                ]
            }]
        },
        options: {
            ...chartDefaults,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        color: '#9ca3af',
                        padding: 10,
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// Load metrics data
async function loadMetrics() {
    try {
        const timeRange = document.getElementById('timeRange').value;
        const response = await fetch(`${API_BASE_URL}/api/gateway/metrics?range=${timeRange}`);
        
        if (!response.ok) throw new Error('Failed to fetch metrics');
        
        const data = await response.json();
        processMetricsData(data);
        updateCharts();
        updateTables();
        updateTransportTab();
    } catch (error) {
        console.error('Error loading metrics:', error);
    }
}

// Process raw metrics data
function processMetricsData(data) {
    metricsData = {
        ...metricsData,
        ...data,
        responseDistribution: calculateResponseDistribution(data.responseTimes || []),
        transportMetrics: normalizeTransportMetrics(data.transportMetrics || {})
    };
}

// Calculate response time distribution
function calculateResponseDistribution(responseTimes) {
    const buckets = {
        '0-50': 0,
        '50-100': 0,
        '100-200': 0,
        '200-500': 0,
        '500+': 0
    };
    
    responseTimes.forEach(time => {
        if (time < 50) buckets['0-50']++;
        else if (time < 100) buckets['50-100']++;
        else if (time < 200) buckets['100-200']++;
        else if (time < 500) buckets['200-500']++;
        else buckets['500+']++;
    });
    
    return buckets;
}

// Normalize transport metrics for radar chart
function normalizeTransportMetrics(metrics) {
    const normalized = {};
    
    ['stdio', 'http', 'websocket'].forEach(transport => {
        const data = metrics[transport] || {};
        normalized[transport] = {
            requests: normalizeValue(data.requests || 0, 10000),
            successRate: data.successRate || 0,
            avgResponse: normalizeValue(data.avgResponse || 0, 500, true),
            throughput: normalizeValue(data.throughput || 0, 1000),
            uptime: data.uptime || 0
        };
    });
    
    return normalized;
}

// Normalize value to 0-100 scale
function normalizeValue(value, max, inverse = false) {
    const normalized = Math.min((value / max) * 100, 100);
    return inverse ? 100 - normalized : normalized;
}

// Update all charts
function updateCharts() {
    updateRequestRateChart();
    updateResponseDistributionChart();
    updateTransportPerformanceChart();
    updateErrorTypeChart();
}

// Update request rate chart
function updateRequestRateChart() {
    if (!charts.requestRate || !metricsData.requests) return;
    
    const data = charts.requestRate.data;
    data.labels = metricsData.requests.map(r => formatTime(r.timestamp));
    data.datasets[0].data = metricsData.requests.map(r => r.count);
    data.datasets[1].data = metricsData.errors.map(e => e.count);
    
    charts.requestRate.update();
}

// Update response distribution chart
function updateResponseDistributionChart() {
    if (!charts.responseDistribution || !metricsData.responseDistribution) return;
    
    const dist = metricsData.responseDistribution;
    charts.responseDistribution.data.datasets[0].data = [
        dist['0-50'] || 0,
        dist['50-100'] || 0,
        dist['100-200'] || 0,
        dist['200-500'] || 0,
        dist['500+'] || 0
    ];
    
    charts.responseDistribution.update();
}

// Update transport performance radar chart
function updateTransportPerformanceChart() {
    if (!charts.transportPerformance || !metricsData.transportMetrics) return;
    
    const metrics = metricsData.transportMetrics;
    
    ['stdio', 'http', 'websocket'].forEach((transport, index) => {
        const data = metrics[transport] || {};
        charts.transportPerformance.data.datasets[index].data = [
            data.requests || 0,
            data.successRate || 0,
            data.avgResponse || 0,
            data.throughput || 0,
            data.uptime || 0
        ];
    });
    
    charts.transportPerformance.update();
}

// Update error type chart
function updateErrorTypeChart() {
    if (!charts.errorType || !metricsData.errorBreakdown) return;
    
    const breakdown = metricsData.errorBreakdown || {};
    charts.errorType.data.datasets[0].data = [
        breakdown.timeout || 0,
        breakdown.connection || 0,
        breakdown.serverError || 0,
        breakdown.clientError || 0,
        breakdown.other || 0
    ];
    
    charts.errorType.update();
}

// Update summary cards
function updateSummaryCards() {
    document.getElementById('totalRequests').textContent = 
        formatNumber(metricsData.totalRequests || 0);
    
    document.getElementById('successRate').textContent = 
        formatPercentage(metricsData.successRate || 99.9);
    
    document.getElementById('avgResponse').textContent = 
        formatDuration(metricsData.avgResponseTime || 45);
    
    document.getElementById('uptime').textContent = 
        formatPercentage(metricsData.uptime || 99.99);
}

// Update server performance table
function updateTables() {
    const tbody = document.querySelector('#serverPerfTable tbody');
    if (!tbody || !metricsData.serverMetrics) return;
    
    tbody.innerHTML = metricsData.serverMetrics.map(server => `
        <tr>
            <td class="server-name">${server.name}</td>
            <td><span class="transport-label ${server.transport}">${server.transport}</span></td>
            <td>${formatNumber(server.requests)}</td>
            <td class="${getPerformanceClass(server.successRate, 99, 95)}">${formatPercentage(server.successRate)}</td>
            <td class="${getPerformanceClass(server.avgResponse, 100, 200, true)}">${server.avgResponse}ms</td>
            <td class="${getPerformanceClass(server.p95Response, 200, 500, true)}">${server.p95Response}ms</td>
            <td class="${getPerformanceClass(server.p99Response, 500, 1000, true)}">${server.p99Response}ms</td>
            <td>
                <div class="status-cell">
                    <span class="status-badge ${server.status}"></span>
                    ${server.status}
                </div>
            </td>
        </tr>
    `).join('');
}

// Update transport tab content
function showTransportTab(transport) {
    activeTransportTab = transport;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === transport);
    });
    
    updateTransportTab();
}

// Update transport tab content
function updateTransportTab() {
    const tabContent = document.getElementById('transportTabContent');
    const data = metricsData.transportMetrics[activeTransportTab] || {};
    
    tabContent.innerHTML = `
        <div class="transport-stats-grid">
            <div class="transport-stat-card">
                <div class="transport-stat-value">${formatNumber(data.totalRequests || 0)}</div>
                <div class="transport-stat-label">Total Requests</div>
            </div>
            <div class="transport-stat-card">
                <div class="transport-stat-value">${formatPercentage(data.successRate || 0)}</div>
                <div class="transport-stat-label">Success Rate</div>
            </div>
            <div class="transport-stat-card">
                <div class="transport-stat-value">${data.avgResponse || 0}ms</div>
                <div class="transport-stat-label">Avg Response Time</div>
            </div>
            <div class="transport-stat-card">
                <div class="transport-stat-value">${data.activeConnections || 0}</div>
                <div class="transport-stat-label">Active Connections</div>
            </div>
        </div>
        
        <div class="performance-breakdown-container">
            <h4>Performance Breakdown</h4>
            <div class="chart-wrapper" style="position: relative; height: 200px;">
                <canvas id="${activeTransportTab}PerfChart"></canvas>
            </div>
        </div>
    `;
    
    // Create transport-specific performance chart
    createTransportChart(activeTransportTab, data);
}

// Create transport-specific chart
function createTransportChart(transport, data) {
    const ctx = document.getElementById(`${transport}PerfChart`);
    if (!ctx) return;
    
    new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.timeline?.map(t => formatTime(t.timestamp)) || [],
            datasets: [{
                label: 'Requests per minute',
                data: data.timeline?.map(t => t.requests) || [],
                borderColor: getTransportColor(transport),
                backgroundColor: getTransportColor(transport, 0.1),
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4
            }]
        },
        options: {
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
                        color: '#333',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    grid: {
                        color: '#333',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#9ca3af'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// Update recent errors
function updateRecentErrors() {
    const errorsContainer = document.getElementById('recentErrors');
    if (!errorsContainer || !metricsData.recentErrors) return;
    
    errorsContainer.innerHTML = metricsData.recentErrors.map(error => `
        <div class="error-item">
            <div class="error-timestamp">${formatTimestamp(error.timestamp)}</div>
            <div class="error-message">${error.message}</div>
            <div class="error-server">Server: ${error.server} (${error.transport})</div>
        </div>
    `).join('');
}

// Chart control handlers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('chart-control')) {
        const metric = e.target.dataset.metric;
        const controls = e.target.parentElement.querySelectorAll('.chart-control');
        
        controls.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        // Toggle dataset visibility
        if (charts.requestRate) {
            charts.requestRate.data.datasets.forEach((dataset, index) => {
                dataset.hidden = (metric === 'requests' && index === 1) || 
                               (metric === 'errors' && index === 0);
            });
            charts.requestRate.update();
        }
    }
});

// Update time range
function updateTimeRange() {
    metricsData.timeRange = document.getElementById('timeRange').value;
    loadMetrics();
}

// Export metrics
async function exportMetrics() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/gateway/metrics/export?range=${metricsData.timeRange}`);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-metrics-${new Date().toISOString()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error exporting metrics:', error);
    }
}

// Start polling for updates
function startPolling() {
    setInterval(() => {
        loadMetrics();
        updateRecentErrors();
    }, UPDATE_INTERVAL);
}

// Utility functions
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString();
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatPercentage(value) {
    return `${value.toFixed(1)}%`;
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function getPerformanceClass(value, goodThreshold, badThreshold, inverse = false) {
    if (inverse) {
        if (value <= goodThreshold) return 'perf-good';
        if (value <= badThreshold) return 'perf-warning';
        return 'perf-bad';
    } else {
        if (value >= goodThreshold) return 'perf-good';
        if (value >= badThreshold) return 'perf-warning';
        return 'perf-bad';
    }
}

function getTransportColor(transport, alpha = 1) {
    const colors = {
        stdio: `rgba(59, 130, 246, ${alpha})`,
        http: `rgba(139, 92, 246, ${alpha})`,
        websocket: `rgba(236, 72, 153, ${alpha})`
    };
    return colors[transport] || `rgba(107, 114, 128, ${alpha})`;
}