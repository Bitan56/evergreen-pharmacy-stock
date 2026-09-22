const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  totalDue: { type: Number, default: 0, min: 0 },
  purchaseHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bill' }]
}, { timestamps: true });

module.exports = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);