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
// POST /api/medicines/upsert - Support optional barcodes, editing, and restocking
// POST /api/medicines/upsert - Support purchase date
router.post('/upsert', async (req, res) => {
  try {
    const { 
      medicineId,
      barcodes, 
      barcode, 
      name, 
      genericName, 
      batchNumber, 
      quantity, 
      costPrice, 
      price, 
      purchaseDate, // <--- Extract purchaseDate
      expiryDate, 
      rackLocation,
      mode
    } = req.body;

    if (!name || !batchNumber || costPrice === undefined || !price || !expiryDate) {
      return res.status(400).json({ error: 'Medicine name, batch number, pricing, and expiry date are required.' });
    }

    const cleanBatch = batchNumber.trim();
    const cleanName = name.trim();
    const finalPurchaseDate = purchaseDate ? new Date(purchaseDate) : new Date();

    // 1. Direct ID Edit Mode
    if (medicineId) {
      const updateData = {
        name: cleanName,
        genericName: (genericName || '').trim(),
        batchNumber: cleanBatch,
        costPrice: Number(costPrice),
        price: Number(price),
        purchaseDate: finalPurchaseDate, // <--- Save purchaseDate
        expiryDate: new Date(expiryDate),
        rackLocation: (rackLocation || 'General Shelf').trim()
      };

      if (mode === 'edit') {
        updateData.quantity = Number(quantity);
      }

      const updateOp = mode === 'edit' 
        ? { $set: updateData } 
        : { $set: updateData,$inc: { quantity: Number(quantity) } };

      const updated = await Medicine.findByIdAndUpdate(medicineId, updateOp, { new: true });
      return res.status(200).json({ success: true, count: 1, medicine: updated });
    }

    // 2. Multi / Single Barcode Handling
    let codeList = Array.isArray(barcodes) && barcodes.length > 0 
      ? barcodes 
      : (barcode ? [barcode] : []);

    if (codeList.length === 0) {
      const cleanPrefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MED';
      codeList = [`${cleanPrefix}-${cleanBatch}-${Date.now().toString().slice(-4)}`];
    }

    const results = await Promise.all(
      codeList.map(code => 
        Medicine.findOneAndUpdate(
          { barcode: code.trim() },
          {
            $set: {
              name: cleanName,
              genericName: (genericName || '').trim(),
              batchNumber: cleanBatch,
              costPrice: Number(costPrice),
              price: Number(price),
              purchaseDate: finalPurchaseDate, // <--- Save purchaseDate
              expiryDate: new Date(expiryDate),
              rackLocation: (rackLocation || 'General Shelf').trim()
            },
            $inc: { quantity: Number(quantity || 0) }
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