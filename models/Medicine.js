const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  genericName: { type: String, trim: true, default: '' },
  barcode: { type: String, required: true, unique: true, trim: true, index: true },
  batchNumber: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  price: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date, required: true },
  rackLocation: { type: String, default: 'General Shelf' }
}, { timestamps: true });

module.exports = mongoose.models.Medicine || mongoose.model('Medicine', MedicineSchema);