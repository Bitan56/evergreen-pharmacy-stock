const express = require('express');
const router = express.Router();
const BillVerification = require('../models/BillVerification');

// GET /api/bills/active - Get the currently active verification checklist
router.get('/active', async (req, res) => {
  try {
    const activeBill = await BillVerification.findOne({ status: 'in-progress' }).sort({ updatedAt: -1 });
    res.status(200).json(activeBill || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bills/upload - Upload a new bill checklist to the database
router.post('/upload', async (req, res) => {
  try {
    const { invoiceNumber, dealerName, items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Valid bill items are required.' });
    }

    // Set any previous active bills to completed or overwrite
    await BillVerification.updateMany({ status: 'in-progress' }, { $set: { status: 'completed' } });

    const newBill = new BillVerification({
      invoiceNumber: invoiceNumber || 'INV-TEMP',
      dealerName: dealerName || 'N/A',
      items,
      status: 'in-progress'
    });

    const saved = await newBill.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bills/:id/update-item - Update match status, received qty, or notes
router.patch('/:id/update-item', async (req, res) => {
  try {
    const { itemId, matched, receivedQty, notes } = req.body;
    
    const updateFields = {};
    if (matched !== undefined) updateFields['items.$.matched'] = matched;
    if (receivedQty !== undefined) updateFields['items.$.receivedQty'] = Number(receivedQty);
    if (notes !== undefined) updateFields['items.$.notes'] = notes;

    const updated = await BillVerification.findOneAndUpdate(
      { _id: req.params.id, 'items.id': itemId },
      { $set: updateFields },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Bill item not found' });
    }

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bills/active - Erase the active bill from DB
router.delete('/active', async (req, res) => {
  try {
    await BillVerification.deleteMany({ status: 'in-progress' });
    res.status(200).json({ message: 'Active bill erased successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;