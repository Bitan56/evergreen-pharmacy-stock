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

// Checkout transaction with atomic stock decrement
router.post('/checkout', async (req, res) => {
  const { customerName, customerPhone, items, subtotal, discount, tax, grandTotal } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  try {
    const now = new Date();

    // 1. Validate stocks and verify no item is expired
    for (const item of items) {
      const med = await Medicine.findById(item.medicineId);
      if (!med) return res.status(404).json({ error: `Product ${item.name} not found.` });
      if (new Date(med.expiryDate) < now) {
        return res.status(400).json({ error: `Cannot sell ${med.name}; batch expired.` });
      }
      if (med.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${med.name}. Stock: ${med.quantity}` });
      }
    }

    // 2. Deduct inventory quantities
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { quantity: -item.quantity }
      });
    }

    // 3. Create invoice document
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const bill = new Bill({
      invoiceNumber,
      customerName: customerName ? customerName.trim() : 'Walk-in Customer',
      customerPhone: customerPhone ? customerPhone.trim() : '',
      items,
      subtotal: Number(subtotal),
      discount: Number(discount) || 0,
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