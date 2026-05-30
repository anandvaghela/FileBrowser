'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

// Routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const usersRoutes = require('./routes/users');
const sharesRoutes = require('./routes/shares');
const rawRoutes = require('./routes/raw');
const searchRoutes = require('./routes/search');
const previewRoutes = require('./routes/preview');
const settingsRoutes = require('./routes/settings');
const usageRoutes = require('./routes/usage');
const tusRoutes = require('./routes/tus');

const { getDb } = require('./db');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  exposedHeaders: ['X-Renew-Token', 'ETag', 'Content-Disposition', 'Content-Range'],
}));

app.use(morgan('dev'));
app.use(cookieParser());

// Parse JSON / urlencoded for most routes (not raw file uploads)
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  // Skip body parsing for raw file streams and TUS patches
  if (ct.startsWith('application/offset+octet-stream')) return next();
  if (
    req.method === 'POST' &&
    (req.path.startsWith('/api/resources') || req.path.startsWith('/api/tus')) &&
    !ct.startsWith('application/json') &&
    !ct.startsWith('multipart/form-data')
  ) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── API routes ────────────────────────────────────────────────────────────────
const baseURL = (process.env.BASE_URL || '').replace(/\/$/, '');
const api = baseURL + '/api';

// Swagger API Documentation UI
app.use(`${baseURL}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Auth
app.use(`${api}`, authRoutes);

// File resources — order matters: /recursive before /* wildcard
app.use(`${api}/resources/recursive`, resourceRoutes);
app.use(`${api}/resources`, resourceRoutes);

// Users
app.use(`${api}/users`, usersRoutes);

// Shares (both /share and /shares and /public)
app.use(`${api}`, sharesRoutes);

// Raw download
app.use(`${api}/raw`, rawRoutes);

// Search
app.use(`${api}/search`, searchRoutes);

// Preview / thumbnails
app.use(`${api}/preview`, previewRoutes);

// Settings
app.use(`${api}/settings`, settingsRoutes);

// Disk usage
app.use(`${api}/usage`, usageRoutes);

// TUS resumable uploads
app.use(`${api}/tus`, tusRoutes);

// ── 404 / Error handlers ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080');
const HOST = process.env.HOST || '0.0.0.0';

// Initialise DB
getDb();

app.listen(PORT, HOST, () => {
  console.log(`\n🗂  FileBrowser API running on http://${HOST}:${PORT}${baseURL || '/'}`);
  console.log(`    API base : http://${HOST}:${PORT}${api}`);
  console.log(`    Swagger  : http://${HOST}:${PORT}${baseURL}/api-docs`);
  console.log(`    Health   : http://${HOST}:${PORT}/health\n`);
});

module.exports = app;
