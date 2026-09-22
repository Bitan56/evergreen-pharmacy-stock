const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');

// 1. Get all inventory sorted by expiry
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ expiryDate: 1 });
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Local Database Barcode Lookup (for POS & restock checking)
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

// 3. Direct Medical API Lookup (OpenFDA + Open Food/Pharma Facts Registry)
router.get('/lookup-external/:barcode', async (req, res) => {
  const barcode = req.params.barcode.trim();

  // Step A: Check local MongoDB first
  try {
    const localMed = await Medicine.findOne({ barcode });
    if (localMed) {
      return res.json({
        found: true,
        source: 'local',
        name: localMed.name,
        genericName: localMed.genericName,
        batchNumber: localMed.batchNumber,
        costPrice: localMed.costPrice,
        price: localMed.price,
        expiryDate: localMed.expiryDate,
        rackLocation: localMed.rackLocation
      });
    }
  } catch (err) {
    console.error('Local lookup error:', err);
  }

  // Step B: Query Open Products Database
  try {
    const externalRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, {
      headers: { 'User-Agent': 'EvergreenPharmacy-ManagementSystem - Web - v1.0' }
    });

    if (externalRes.ok) {
      const data = await externalRes.json();
      if (data.status === 1 && data.product) {
        const prod = data.product;
        const name = prod.product_name || prod.product_name_en || '';
        const genericName = prod.generic_name || prod.generic_name_en || prod.ingredients_text || '';

        if (name) {
          return res.json({
            found: true,
            source: 'external',
            name: name.trim(),
            genericName: genericName.trim()
          });
        }
      }
    }
  } catch (apiErr) {
    console.warn('External barcode lookup error:', apiErr.message);
  }

  // Step C: If barcode is an NDC code, attempt OpenFDA
  try {
    const fdaRes = await fetch(`https://api.fda.gov/drug/ndc.json?search=product_ndc:"${encodeURIComponent(barcode)}"&limit=1`);
    if (fdaRes.ok) {
      const fdaData = await fdaRes.json();
      if (fdaData.results && fdaData.results.length > 0) {
        const drug = fdaData.results[0];
        return res.json({
          found: true,
          source: 'openfda',
          name: drug.brand_name || drug.proprietary_name || '',
          genericName: drug.generic_name || drug.active_ingredients?.map(i => i.name).join(', ') || ''
        });
      }
    }
  } catch (fdaErr) {
    console.warn('OpenFDA lookup error:', fdaErr.message);
  }

  // Not found in any registry — allow user manual entry
  res.json({ found: false, message: 'Barcode not found in external medical registries.' });
});

// 4. Expiry alerts query
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

// 5. Add / Restock Medicine with costPrice
router.post('/upsert', async (req, res) => {
  try {
    const { name, genericName, barcode, batchNumber, quantity, costPrice, price, expiryDate, rackLocation } = req.body;

    if (!name || !barcode || !batchNumber || quantity === undefined || costPrice === undefined || !price || !expiryDate) {
      return res.status(400).json({ error: 'All marked fields (*) are required.' });
    }

    const updated = await Medicine.findOneAndUpdate(
      { barcode: barcode.trim() },
      {
        $set: {
          name: name.trim(),
          genericName: (genericName || '').trim(),
          batchNumber: batchNumber.trim(),
          costPrice: Number(costPrice),
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

// 6. Delete item
router.delete('/:id', async (req, res) => {
  try {
    await Medicine.findByIdAndDelete(req.params.id);
    res.json({ message: 'Medicine removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;