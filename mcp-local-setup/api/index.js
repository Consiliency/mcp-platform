const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routers
const catalogRouter = require('./catalog/router');
const communityRouter = require('./community/features');
const marketplaceRouter = require('./marketplace/discovery');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Static files for dashboard
app.use(express.static(path.join(__dirname, '../dashboard')));

// API routes
app.use('/api/catalog', catalogRouter);
app.use('/api/community', communityRouter);
app.use('/api/marketplace', marketplaceRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route redirects to catalog dashboard
app.get('/', (req, res) => {
  res.redirect('/catalog.html');
});

// Start server
app.listen(PORT, () => {
  console.log(`MCP API server running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/catalog.html`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});