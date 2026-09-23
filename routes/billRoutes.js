const express = require('express');
const router = express.Router();
const BillVerification = require('../models/BillVerification');

// 1. GET /api/bills/active - Get the currently active bill checklist
router.get('/active', async (req, res) => {
  try {
    const activeBill = await BillVerification.findOne({ status: 'in-progress' }).sort({ updatedAt: -1 });
    res.status(200).json(activeBill || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/bills/upload - Upload and save a new bill checklist
router.post('/upload', async (req, res) => {
  try {
    const { invoiceNumber, dealerName, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Valid bill items array is required.' });
    }

    // Mark previous active bills as completed
    await BillVerification.updateMany({ status: 'in-progress' }, { $set: { status: 'completed' } });

    const newBill = new BillVerification({
      invoiceNumber: (invoiceNumber || 'INV-TEMP').trim(),
      dealerName: (dealerName || 'N/A').trim(),
      items,
      status: 'in-progress'
    });

    const saved = await newBill.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PATCH /api/bills/:id/update-item - Sync checkbox, quantity, or notes in real-time
router.patch('/:id/update-item', async (req, res) => {
  try {
    const { itemId, matched, receivedQty, notes } = req.body;

    const updateFields = {};
    if (matched !== undefined) updateFields['items.$.matched'] = Boolean(matched);
    if (receivedQty !== undefined) updateFields['items.$.receivedQty'] = Number(receivedQty);
    if (notes !== undefined) updateFields['items.$.notes'] = notes;

    const updated = await BillVerification.findOneAndUpdate(
      { _id: req.params.id, 'items.id': Number(itemId) },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Item not found in this bill' });
    }

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE /api/bills/active - Erase active bill from database
router.delete('/active', async (req, res) => {
  try {
    await BillVerification.deleteMany({ status: 'in-progress' });
    res.status(200).json({ message: 'Active bill erased successfully from database.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;