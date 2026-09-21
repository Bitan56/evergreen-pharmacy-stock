const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Bill = require('../models/Bill');

// Get recent bills
router.get('/', async (req, res) => {
  try {
    const bills = await Bill.find().sort({ createdAt: -1 }).limit(50);
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process a POS checkout & deduct stock atomically
router.post('/checkout', async (req, res) => {
  const { customerName, customerPhone, items, subtotal, tax, grandTotal } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  try {
    // 1. Validate stock availability and verify item expiration
    const now = new Date();
    for (const item of items) {
      const med = await Medicine.findById(item.medicineId);
      if (!med) {
        return res.status(404).json({ error: `Product ${item.name} does not exist.` });
      }
      if (new Date(med.expiryDate) < now) {
        return res.status(400).json({ error: `Cannot sell ${med.name}; batch has expired.` });
      }
      if (med.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${med.name}. Available: ${med.quantity}, Requested: ${item.quantity}`
        });
      }
    }

    // 2. Atomically deduct quantities
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { quantity: -item.quantity }
      });
    }

    // 3. Create invoice
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const bill = new Bill({
      invoiceNumber,
      customerName: customerName ? customerName.trim() : 'Walk-in Customer',
      customerPhone: customerPhone ? customerPhone.trim() : '',
      items,
      subtotal: Number(subtotal),
      tax: Number(tax),
      grandTotal: Number(grandTotal)
    });

    const savedBill = await bill.save();
    res.status(201).json(savedBill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;