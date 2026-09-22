const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');

// Get recent bills
router.get('/', async (req, res) => {
  try {
    const bills = await Bill.find().sort({ createdAt: -1 }).limit(50);
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checkout transaction with atomic stock decrement & customer dues update
router.post('/checkout', async (req, res) => {
  const {
    customerName,
    customerPhone,
    items,
    subtotal,
    discount,
    tax,
    previousDue,
    grandTotal,
    amountPaid,
    remainingDue
  } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  try {
    const now = new Date();

    // 1. Validate stocks and expiration
    for (const item of items) {
      const med = await Medicine.findById(item.medicineId);
      if (!med) return res.status(404).json({ error: `Product ${item.name} not found.` });
      if (new Date(med.expiryDate) < now) {
        return res.status(400).json({ error: `Cannot sell ${med.name}; batch expired.` });
      }
      if (med.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${med.name}. Available: ${med.quantity}` });
      }
    }

    // 2. Deduct inventory
    for (const item of items) {
      await Medicine.findByIdAndUpdate(item.medicineId, {
        $inc: { quantity: -item.quantity }
      });
    }

    // 3. Upsert Customer Record if phone number is provided
    let customerDoc = null;
    const cleanPhone = (customerPhone || '').trim();

    if (cleanPhone && cleanPhone.length >= 10) {
      customerDoc = await Customer.findOne({ phone: cleanPhone });
      if (!customerDoc) {
        customerDoc = new Customer({
          phone: cleanPhone,
          name: (customerName || 'Customer').trim(),
          totalDue: Number(remainingDue) || 0
        });
      } else {
        customerDoc.name = (customerName || customerDoc.name).trim();
        customerDoc.totalDue = Number(remainingDue) || 0;
      }
    }

    // 4. Save Invoice
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const bill = new Bill({
      invoiceNumber,
      customerId: customerDoc ? customerDoc._id : null,
      customerName: customerName ? customerName.trim() : 'Walk-in Customer',
      customerPhone: cleanPhone,
      items,
      subtotal: Number(subtotal),
      discount: Number(discount) || 0,
      tax: Number(tax),
      previousDue: Number(previousDue) || 0,
      grandTotal: Number(grandTotal),
      amountPaid: Number(amountPaid),
      remainingDue: Number(remainingDue) || 0
    });

    const savedBill = await bill.save();

    // 5. Link invoice to customer profile
    if (customerDoc) {
      customerDoc.purchaseHistory.push(savedBill._id);
      await customerDoc.save();
    }

    res.status(201).json(savedBill);
  } catch (err) {
    console.error('Checkout failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;