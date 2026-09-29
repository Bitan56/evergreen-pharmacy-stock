const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// Helper to escape regex special characters
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// ==========================================
// 1. GET ALL MEDICINES
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
// 3. LOW STOCK ALERT (< threshold, default 2)
// ==========================================
router.get('/alerts/low-stock', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 2;
    const lowStockMedicines = await Medicine.find({
      quantity: { $lt: threshold }
    }).sort({ quantity: 1, name: 1 });

    res.status(200).json(lowStockMedicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. SCAN / LOOKUP BY BARCODE OR BATCH
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
// 5. UPDATE STOCK (MARK SOLD OUT / SET QTY)
// ==========================================
router.patch('/:id/set-stock', async (req, res) => {
  try {
    const { quantity } = req.body;
    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $set: { quantity: Math.max(0, parseInt(quantity) || 0) } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Medicine not found.' });
    res.status(200).json({ success: true, medicine: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. MERGE EXISTING DUPLICATES (Fixes OMEZ, etc.)
// ==========================================
router.post('/merge-duplicates', async (req, res) => {
  try {
    const all = await Medicine.find();
    const grouped = {};

    for (const med of all) {
      const key = `${med.name.trim().toLowerCase()}__${med.batchNumber.trim().toLowerCase()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(med);
    }

    let mergedGroups = 0;
    let deletedCount = 0;

    for (const key of Object.keys(grouped)) {
      const list = grouped[key];
      if (list.length > 1) {
        // Sort: prioritize entry that has actual stock or real barcode
        list.sort((a, b) => b.quantity - a.quantity);
        const master = list[0];
        const duplicates = list.slice(1);

        let totalQty = master.quantity;
        const deleteIds = [];

        for (const dup of duplicates) {
          totalQty += dup.quantity;
          deleteIds.push(dup._id);
        }

        master.quantity = totalQty;
        if (master.barcode.startsWith('NOCODE-')) {
          const nonDummy = duplicates.find(d => !d.barcode.startsWith('NOCODE-'));
          if (nonDummy) {
            master.barcode = nonDummy.barcode;
            master.hasBarcode = true;
          }
        }

        await master.save();
        await Medicine.deleteMany({ _id: { $in: deleteIds } });

        mergedGroups++;
        deletedCount += duplicates.length;
      }
    }

    res.status(200).json({
      success: true,
      message: `Cleaned up ${mergedGroups} duplicate medicine group(s) (${deletedCount} redundant slots removed).`,
      mergedGroups,
      deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. ADD / RESTOCK / EDIT MEDICINE
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
      packOf,
      batchNumber,
      dealerName,
      purchaseInvoiceNumber,
      quantity,
      costPrice,
      price,
      purchaseDate,
      expiryDate,
      rackLocation,
      mode // 'edit' or 'restock'
    } = req.body;

    if (!name || !batchNumber || costPrice === undefined || !price || !expiryDate) {
      return res.status(400).json({
        error: 'Medicine name, batch number, pricing, and expiry date are required.'
      });
    }

    const cleanName = name.trim();
    const cleanGeneric = (genericName || '').trim();
    const cleanPackOf = (packOf || '').trim();
    const cleanBatch = batchNumber.trim();
    const cleanDealer = (dealerName || '').trim();
    const cleanInvoice = (purchaseInvoiceNumber || '').trim();
    const cleanRack = (rackLocation || 'General Shelf').trim();
    const finalPurchaseDate = purchaseDate ? new Date(purchaseDate) : new Date();
    const finalExpiryDate = new Date(expiryDate);

    // 1. Direct ID Edit
    if (medicineId) {
      const updateData = {
        name: cleanName,
        genericName: cleanGeneric,
        packOf: cleanPackOf,
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

      const updateOp = (mode === 'edit')
        ? { $set: updateData, quantity: Number(quantity) }
        : { $set: updateData,$inc: { quantity: Number(quantity || 0) } };

      const updated = await Medicine.findByIdAndUpdate(medicineId, updateOp, {
        new: true,
        runValidators: true
      });

      if (updated) {
        return res.status(200).json({ success: true, count: 1, medicine: updated });
      }
    }

    // 2. Match existing medicine with the exact same Name + Batch Number
    const existing = await Medicine.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
      batchNumber: { $regex: new RegExp(`^${escapeRegex(cleanBatch)}$`, 'i') }
    });

    if (existing) {
      if (mode === 'edit') {
        existing.quantity = Number(quantity);
      } else {
        existing.quantity += Number(quantity || 0);
      }
      existing.costPrice = Number(costPrice);
      existing.price = Number(price);
      existing.expiryDate = finalExpiryDate;
      existing.purchaseDate = finalPurchaseDate;
      if (cleanPackOf) existing.packOf = cleanPackOf;
      if (cleanGeneric) existing.genericName = cleanGeneric;
      if (cleanDealer) existing.dealerName = cleanDealer;
      if (cleanInvoice) existing.purchaseInvoiceNumber = cleanInvoice;
      if (cleanRack) existing.rackLocation = cleanRack;

      await existing.save();
      return res.status(200).json({ success: true, count: 1, medicine: existing });
    }

    // 3. New Entry - Generate consistent deterministic barcode if none provided
    let codeList = Array.isArray(barcodes) && barcodes.length > 0
      ? barcodes
      : (barcode ? [barcode] : []);

    let isMarkedNoBarcode = false;
    if (codeList.length === 0) {
      const prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MED';
      const safeBatch = cleanBatch.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'BATCH';
      codeList = [`NOCODE-${prefix}-${safeBatch}`];
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
            $set: {               name: cleanName,               genericName: cleanGeneric,               packOf: cleanPackOf,               batchNumber: cleanBatch,               dealerName: cleanDealer,               purchaseInvoiceNumber: cleanInvoice,               costPrice: Number(costPrice),               price: Number(price),               purchaseDate: finalPurchaseDate,               expiryDate: finalExpiryDate,               rackLocation: cleanRack,               hasBarcode: effectiveHasBarcode             },$inc: { quantity: Number(quantity || 0) }
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
// 8. ATTACH BARCODE TO AN UNMARKED MEDICINE
// ==========================================
router.patch('/:id/attach-barcode', async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode || !barcode.trim()) {
      return res.status(400).json({ error: 'A valid barcode must be provided.' });
    }

    const cleanBarcode = barcode.trim();
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
      { $set: { barcode: cleanBarcode, hasBarcode: true } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'Medicine not found.' });
    res.status(200).json({ success: true, medicine: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 9. BULK UPLOAD (MERGES MATCHING BATCHES)
// ==========================================
router.post('/bulk-upload', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Payload must be a non-empty array of medicine objects.' });
    }

    let modifiedCount = 0;
    let upsertedCount = 0;

    for (const item of items) {
      const cleanName = (item.name || '').trim();
      const cleanBatch = (item.batchNumber || '').trim();
      let cleanCode = (item.barcode || '').trim();
      let hasCode = true;

      if (!cleanCode) {
        const prefix = cleanName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MED';
        const safeBatch = cleanBatch.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'BATCH';
        cleanCode = `NOCODE-${prefix}-${safeBatch}`;
        hasCode = false;
      }

      // Check by Name + Batch or Barcode
      const existing = await Medicine.findOne({
        $or: [
          { barcode: cleanCode },
          {
            name: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
            batchNumber: { $regex: new RegExp(`^${escapeRegex(cleanBatch)}$`, 'i') }
          }
        ]
      });

      if (existing) {
        existing.quantity += Number(item.quantity || 0);
        if (item.costPrice) existing.costPrice = Number(item.costPrice);
        if (item.price) existing.price = Number(item.price);
        if (item.expiryDate) existing.expiryDate = new Date(item.expiryDate);
        if (item.genericName) existing.genericName = item.genericName.trim();
        if (item.packOf || item.pack) existing.packOf = (item.packOf || item.pack).trim();
        await existing.save();
        modifiedCount++;
      } else {
        await Medicine.create({
          name: cleanName,
          genericName: (item.genericName || '').trim(),
          packOf: (item.packOf || item.pack || '').trim(),
          batchNumber: cleanBatch,
          dealerName: (item.dealerName || '').trim(),
          purchaseInvoiceNumber: (item.purchaseInvoiceNumber || '').trim(),
          quantity: Number(item.quantity || 0),
          costPrice: Number(item.costPrice || 0),
          price: Number(item.price || 0),
          purchaseDate: item.purchaseDate ? new Date(item.purchaseDate) : new Date(),
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : new Date(),
          rackLocation: (item.rackLocation || 'General Shelf').trim(),
          barcode: cleanCode,
          hasBarcode: hasCode
        });
        upsertedCount++;
      }
    }

    res.status(200).json({ success: true, upsertedCount, modifiedCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 10. BULK DELETE
// ==========================================
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of medicine IDs is required.' });
    }

    const result = await Medicine.deleteMany({ _id: { $in: ids } });
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} medicine(s).`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. DELETE SINGLE MEDICINE
// ==========================================
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Medicine.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Medicine not found.' });
    res.status(200).json({ message: 'Medicine deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;