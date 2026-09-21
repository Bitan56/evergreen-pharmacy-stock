const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// Get all medicines sorted by expiry
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ expiryDate: 1 });
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Barcode Lookup
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

// Expiry alerts query
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

// Add / Restock Medicine
router.post('/upsert', async (req, res) => {
  try {
    const { name, genericName, barcode, batchNumber, quantity, price, expiryDate, rackLocation } = req.body;

    if (!name || !barcode || !batchNumber || quantity === undefined || !price || !expiryDate) {
      return res.status(400).json({ error: 'All marked fields are required.' });
    }

    const updated = await Medicine.findOneAndUpdate(
      { barcode: barcode.trim() },
      {
        $set: {
          name: name.trim(),
          genericName: (genericName || '').trim(),
          batchNumber: batchNumber.trim(),
          price: Number(price),
          expiryDate: new Date(expiryDate),
          rackLocation: (rackLocation || 'General Shelf').trim()
        },
        $inc: { quantity: Number(quantity) }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete item
router.delete('/:id', async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medicine removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;