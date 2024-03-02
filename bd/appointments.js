const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  startTime: Date,
  endTime: Date,
}, { collection: 'appointments' }); // Указание конкретной коллекции

module.exports = mongoose.model('Appointment', appointmentSchema);
