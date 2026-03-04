const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const identifyRoutes = require('./routes/identifyRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// API routes
// Spec says endpoint should be POST /identify (no prefix)
app.use(identifyRoutes);

// 404 handler 
app.use(notFoundHandler);

// Error handler 
app.use(errorHandler);

module.exports = app;
