const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// 1. Get all inventory sorted by expiry date
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ expiryDate: 1 });
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Local Database Barcode Lookup (for POS & Restock check)
router.get('/scan/:barcode', async (req, res) => {
  try {
    const barcode = req.params.barcode.trim();
    const medicine = await Medicine.findOne({ barcode });
    if (!medicine) {
      return res.status(404).json({ message: `No medicine found for barcode [${barcode}]` });
    }
    res.json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Expiry alerts query
router.get('/alerts/expiring', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    const expiringBatches = await Medicine.find({
      expiryDate: { $lte: thresholdDate }
    }).sort({ expiryDate: 1 });

    res.json(expiringBatches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Add or Restock Medicine (with Cost Price & Selling Price)
// POST /api/medicines/upsert - Support single or multiple barcodes
router.post('/upsert', async (req, res) => {
  try {
    const { barcodes, barcode, name, genericName, batchNumber, quantity, costPrice, price, expiryDate, rackLocation } = req.body;

    const codeList = Array.isArray(barcodes) && barcodes.length > 0 
      ? barcodes 
      : (barcode ? [barcode] : []);

    if (!codeList.length || !name || !batchNumber || quantity === undefined || costPrice === undefined || !price || !expiryDate) {
      return res.status(400).json({ error: 'At least one barcode and all required fields (*) must be provided.' });
    }

    // Save/update each barcode entry under this batch
    const results = await Promise.all(
      codeList.map(code => 
        Medicine.findOneAndUpdate(
          { barcode: code.trim() },
          {
            $set: {
              name: name.trim(),
              genericName: (genericName || '').trim(),
              batchNumber: batchNumber.trim(),
              costPrice: Number(costPrice),
              price: Number(price),
              expiryDate: new Date(expiryDate),
              rackLocation: (rackLocation || 'General Shelf').trim()
            },
            $inc: { quantity: Number(quantity) }
          },
          { new: true, upsert: true, runValidators: true }
        )
      )
    );

    res.status(200).json({ success: true, count: results.length, medicines: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Delete item
router.delete('/:id', async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medicine removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;