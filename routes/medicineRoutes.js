const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// ==========================================
// 1. GET ALL MEDICINES (Sorted by nearest expiry)
// ==========================================
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ expiryDate: 1 });
    res.status(200).json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. EXPIRING MEDICINES ALERT
// ==========================================
router.get('/alerts/expiring', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    const expiringMedicines = await Medicine.find({
      expiryDate: { $lte: cutoffDate }
    }).sort({ expiryDate: 1 });

    res.status(200).json(expiringMedicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. SCAN / LOOKUP BY BARCODE OR BATCH
// ==========================================
router.get('/scan/:barcode', async (req, res) => {
  try {
    const code = decodeURIComponent(req.params.barcode).trim();
    const medicine = await Medicine.findOne({
      $or: [{ barcode: code }, { batchNumber: code }]
    });

    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found with this barcode/batch' });
    }

    res.status(200).json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. ADD / RESTOCK / EDIT MEDICINES (Single & Multi-Barcode)
// ==========================================
router.post('/upsert', async (req, res) => {
  try {
    const {
      medicineId,
      barcodes,
      barcode,
      hasBarcode,
      name,
      genericName,
      batchNumber,
      dealerName,
      purchaseInvoiceNumber,
      quantity,
      costPrice,
      price,
      purchaseDate,
      expiryDate,
      rackLocation,
      mode // 'edit' (overwrites quantity) or 'restock' (increments quantity)
    } = req.body;

    if (!name || !batchNumber || costPrice === undefined || !price || !expiryDate) {
      return res.status(400).json({
        error: 'Medicine name, batch number, pricing, and expiry date are required.'
      });
    }

    const cleanName = name.trim();
    const cleanBatch = batchNumber.trim();
    const cleanDealer = (dealerName || '').trim();
    const cleanInvoice = (purchaseInvoiceNumber || '').trim();
    const cleanRack = (rackLocation || 'General Shelf').trim();
    const finalPurchaseDate = purchaseDate ? new Date(purchaseDate) : new Date();
    const finalExpiryDate = new Date(expiryDate);

    // Case A: Direct Edit by ID
    if (medicineId) {
      const updateData = {
        name: cleanName,
        genericName: (genericName || '').trim(),
        batchNumber: cleanBatch,
        dealerName: cleanDealer,
        purchaseInvoiceNumber: cleanInvoice,
        costPrice: Number(costPrice),
        price: Number(price),
        purchaseDate: finalPurchaseDate,
        expiryDate: finalExpiryDate,
        rackLocation: cleanRack
      };

      if (hasBarcode !== undefined) {
        updateData.hasBarcode = Boolean(hasBarcode);
      }

      if (mode === 'edit') {
        updateData.quantity = Number(quantity);
      }

      const updateOp = mode === 'edit'
        ? { $set: updateData }
        : { $set: updateData,$inc: { quantity: Number(quantity || 0) } };

      const updated = await Medicine.findByIdAndUpdate(medicineId, updateOp, {
        new: true,
        runValidators: true
      });

      if (!updated) {
        return res.status(404).json({ error: 'Medicine record not found for update.' });
      }

      return res.status(200).json({ success: true, count: 1, medicine: updated });
    }

    // Case B: Upsert by Barcodes (Single or Multi-Barcode)
    let codeList = Array.isArray(barcodes) && barcodes.length > 0
      ? barcodes
      : (barcode ? [barcode] : []);

    let isMarkedNoBarcode = false;

    // If no barcode provided, flag item and assign internal temporary ID
    if (codeList.length === 0) {
      const prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MED';
      codeList = [`NOCODE-${prefix}-${cleanBatch}-${Date.now().toString().slice(-4)}`];
      isMarkedNoBarcode = true;
    }

    const results = await Promise.all(
      codeList.map(code => {
        const cleanCode = code.trim();
        const effectiveHasBarcode = (hasBarcode !== undefined)
          ? Boolean(hasBarcode)
          : (!isMarkedNoBarcode && !cleanCode.startsWith('NOCODE-'));

        return Medicine.findOneAndUpdate(
          { barcode: cleanCode },
          {
            $set: {
              name: cleanName,
              genericName: (genericName || '').trim(),
              batchNumber: cleanBatch,
              dealerName: cleanDealer,
              purchaseInvoiceNumber: cleanInvoice,
              costPrice: Number(costPrice),
              price: Number(price),
              purchaseDate: finalPurchaseDate,
              expiryDate: finalExpiryDate,
              rackLocation: cleanRack,
              hasBarcode: effectiveHasBarcode
            },
            $inc: { quantity: Number(quantity || 0) }
          },
          { new: true, upsert: true, runValidators: true }
        );
      })
    );

    res.status(200).json({ success: true, count: results.length, medicines: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 5. ATTACH BARCODE TO AN UNMARKED MEDICINE
// ==========================================
router.patch('/:id/attach-barcode', async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ error: 'A valid barcode must be provided.' });
    }

    const cleanBarcode = barcode.trim();

    // Prevent assigning a barcode that already belongs to a different item
    const duplicate = await Medicine.findOne({
      barcode: cleanBarcode,
      _id: { $ne: req.params.id }
    });

    if (duplicate) {
      return res.status(400).json({
        error: `Barcode "${cleanBarcode}" is already assigned to ${duplicate.name} (Batch ${duplicate.batchNumber}).`
      });
    }

    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          barcode: cleanBarcode,
          hasBarcode: true
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Medicine record not found.' });
    }

    res.status(200).json({ success: true, medicine: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 6. BULK IMPORT VIA JSON FILE
// ==========================================
router.post('/bulk-upload', async (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Payload must be a non-empty array of medicine objects.' });
    }

    const operations = items.map(item => {
      const cleanName = (item.name || '').trim();
      const cleanBatch = (item.batchNumber || '').trim();
      let cleanCode = (item.barcode || '').trim();
      let hasCode = true;

      if (!cleanCode) {
        const prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MED';
        cleanCode = `NOCODE-${prefix}-${cleanBatch || 'BATCH'}-${Math.floor(1000 + Math.random() * 9000)}`;
        hasCode = false;
      }

      return {
        updateOne: {
          filter: { barcode: cleanCode },
          update: {
            $set: {
              name: cleanName,
              genericName: (item.genericName || '').trim(),
              batchNumber: cleanBatch,
              dealerName: (item.dealerName || '').trim(),
              purchaseInvoiceNumber: (item.purchaseInvoiceNumber || '').trim(),
              costPrice: Number(item.costPrice || 0),
              price: Number(item.price || 0),
              purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : new Date(),
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(),
              rackLocation: (item.rackLocation || 'General Shelf').trim(),
              hasBarcode: hasCode
            },
            $inc: { quantity: Number(item.quantity || 0) }
          },
          upsert: true
        }
      };
    });

    const bulkResult = await Medicine.bulkWrite(operations);
    res.status(200).json({
      success: true,
      upsertedCount: bulkResult.upsertedCount,
      modifiedCount: bulkResult.modifiedCount
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 7. DELETE MEDICINE RECORD
// ==========================================
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Medicine.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Medicine record not found.' });
    }
    res.status(200).json({ message: 'Medicine deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;