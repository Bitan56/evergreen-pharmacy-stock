const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  name: { type: String, required: true },
  genericName: { type: String, default: '' },
  batchNumber: { type: String, default: '' },
  billedQty: { type: Number, default: 0 },
  receivedQty: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  expiryDate: { type: String, default: '' },
  barcode: { type: String, default: '' },
  matched: { type: Boolean, default: false },
  notes: { type: String, default: '' }
});

const billVerificationSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true },
    dealerName: { type: String, default: 'N/A' },
    items: [billItemSchema],
    status: { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BillVerification', billVerificationSchema);