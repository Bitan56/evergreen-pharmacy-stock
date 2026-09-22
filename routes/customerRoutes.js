const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');

// 1. Live auto-lookup as the cashier types phone number
router.get('/lookup/:query', async (req, res) => {
  try {
    const q = req.params.query.trim();
    if (!q || q.length < 3) return res.json([]);

    const matches = await Customer.find({
      phone: { $regex: '^' + q, $options: 'i' }
    }).limit(5);

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch all customers with their dues
router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ updatedAt: -1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. View customer details & purchase bills
router.get('/:id/bills', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate({
      path: 'purchaseHistory',
      options: { sort: { createdAt: -1 } }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Manually clear/settle due amount
router.patch('/:id/clear-due', async (req, res) => {
  try {
    const { amountPaid } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.totalDue = Math.max(0, customer.totalDue - (Number(amountPaid) || 0));
    await customer.save();

    res.json({ message: 'Due settled successfully', totalDue: customer.totalDue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;