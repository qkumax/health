const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: String,
  surname: String,
  major: String,
}, { collection: 'doctors' }); // Указание конкретной коллекции

module.exports = mongoose.model('Doctor', doctorSchema);
