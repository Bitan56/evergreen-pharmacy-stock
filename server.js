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

// Ensure MongoDB is connected for every incoming serverless request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

// API Endpoints
app.use('/api/medicines', medicineRoutes);
app.use('/api/billing', billingRoutes);

// If running locally with `node server.js`
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Pharmacy server running on http://localhost:${PORT}`));
}

// Export for Vercel Serverless
module.exports = app;