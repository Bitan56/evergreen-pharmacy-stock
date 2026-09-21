// Polyfill for Node v18 Web Crypto API compatibility with MongoDB driver v6+
const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./db');
const medicineRoutes = require('./routes/medicineRoutes');
const billingRoutes = require('./routes/billingRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Connect database for incoming requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// Mount APIs
app.use('/api/medicines', medicineRoutes);
app.use('/api/billing', billingRoutes);

// Explicit root route serving index.html
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
  app.listen(PORT, () => console.log(`Pharmacy server live at http://localhost:${PORT}`));
}