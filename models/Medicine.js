const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    barcode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    genericName: { type: String, default: '' },
    batchNumber: { type: String, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    purchaseDate: { type: Date, default: Date.now }, // <--- Added Purchase Date field
    expiryDate: { type: Date, required: true, index: true },
    rackLocation: { type: String, default: 'General Shelf' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Medicine', medicineSchema);