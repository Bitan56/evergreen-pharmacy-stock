const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    speciality: { type: String, required: true, trim: true },
    qualifications: { type: String, default: '', trim: true },
    appointmentDays: [{ type: String, trim: true }], // e.g. ["Mon", "Wed", "Fri"]
    appointmentTime: { type: String, required: true, trim: true }, // e.g. "5:00 PM - 8:00 PM"
    fees: { type: Number, required: true, default: 0 },
    phone: { type: String, default: '', trim: true },
    roomNumber: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Doctor', doctorSchema);