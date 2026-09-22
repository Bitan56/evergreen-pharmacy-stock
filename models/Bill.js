const mongoose = require('mongoose');

const BillItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  name: { type: String, required: true },
  batchNumber: { type: String, required: true },
  expiryDate: { type: String, default: 'N/A' },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  total: { type: Number, required: true }
});

const BillSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: { type: String, default: '' },
  items: [BillItemSchema],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  tax: { type: Number, required: true },
  previousDue: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true }, // subtotal - discount + tax + previousDue
  amountPaid: { type: Number, required: true },
  remainingDue: { type: Number, default: 0 } // Amount unpaid on this bill
}, { timestamps: true });

module.exports = mongoose.models.Bill || mongoose.model('Bill', BillSchema);