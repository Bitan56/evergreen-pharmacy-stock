const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    genericName: { type: String, default: '', trim: true },
    packOf: { type: String, default: '', trim: true }, // e.g. "10 Tablets", "15 Capsules", "100 ml"
    batchNumber: { type: String, required: true, trim: true },
    barcode: { type: String, required: true, trim: true, unique: true },
    hasBarcode: { type: Boolean, default: true },
    dealerName: { type: String, default: '', trim: true },
    purchaseInvoiceNumber: { type: String, default: '', trim: true },
    quantity: { type: Number, required: true, default: 0 },
    costPrice: { type: Number, required: true, default: 0 },
    price: { type: Number, required: true, default: 0 },
    purchaseDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    rackLocation: { type: String, default: 'General Shelf', trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Medicine', medicineSchema);