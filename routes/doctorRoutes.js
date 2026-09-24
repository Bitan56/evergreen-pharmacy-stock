const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');

// GET all doctors
router.get('/', async (req, res) => {
  try {
    const doctors = await Doctor.find().sort({ name: 1 });
    res.status(200).json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add / update doctor
router.post('/upsert', async (req, res) => {
  try {
    const { doctorId, name, speciality, qualifications, appointmentDays, appointmentTime, fees, phone, roomNumber } = req.body;

    if (!name || !speciality || !appointmentTime || fees === undefined) {
      return res.status(400).json({ error: 'Name, speciality, visiting times, and fees are required.' });
    }

    const docData = {
      name: name.trim(),
      speciality: speciality.trim(),
      qualifications: (qualifications || '').trim(),
      appointmentDays: Array.isArray(appointmentDays) ? appointmentDays : [],
      appointmentTime: appointmentTime.trim(),
      fees: Number(fees),
      phone: (phone || '').trim(),
      roomNumber: (roomNumber || '').trim()
    };

    if (doctorId) {
      const updated = await Doctor.findByIdAndUpdate(doctorId, { $set: docData }, { new: true, runValidators: true });
      if (!updated) return res.status(404).json({ error: 'Doctor not found.' });
      return res.status(200).json({ success: true, doctor: updated });
    }

    const newDoctor = new Doctor(docData);
    const saved = await newDoctor.save();
    res.status(201).json({ success: true, doctor: saved });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE doctor
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Doctor.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Doctor not found.' });
    res.status(200).json({ message: 'Doctor deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;