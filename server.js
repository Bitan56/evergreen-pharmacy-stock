const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./db');
const medicineRoutes = require('./routes/medicineRoutes');
const billingRoutes = require('./routes/billingRoutes');
const customerRoutes = require('./routes/customerRoutes');
const billRoutes = require('./routes/billRoutes'); // New: Bill verification & matching

const app = express();

app.use(cors());

// Support larger payloads for bulk JSON uploads & invoice checklists
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static assets from both root directory and public folder
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection gatekeeper middleware
app.use(async (req, res, next) => {
  // Skip DB connection for static frontend files, root, and health checks
  if (
    req.path === '/' || 
    req.path === '/index.html' || 
    req.path === '/api/health' ||
    !req.path.startsWith('/api')
  ) {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(503).json({ error: 'Database connection failed: ' + err.message });
  }
});

// Mounted APIs
app.use('/api/medicines', medicineRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/bills', billRoutes); // New: Mounts bill matching, tracking, and item checkouts

// Health check endpoint for the frontend status indicator
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.status(200).json({
      status: 'online',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'online',
      database: 'disconnected',
      error: err.message
    });
  }
});

// Fallback to index.html (checks root first, then public directory)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Pharmacy server running on http://localhost:${PORT}`));
}