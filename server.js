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

// Connect DB middleware for serverless
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection failed:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// API Routes
app.use('/api/medicines', medicineRoutes);
app.use('/api/billing', billingRoutes);

// Export for Vercel
module.exports = app;

// Local development only
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Pharmacy server running on port ${PORT}`));
}