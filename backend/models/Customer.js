const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  customer: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: false
  },
  time: {
    type: String,
    required: false
  },
  duration: {
    type: String,
    required: false
  },
  result: {
    type: String,
    required: false
  },
  notes: {
    type: String,
    required: false
  },
  address: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: false
  },
  company: {
    type: String,
    required: false
  },
  url: {
    type: String,
    required: false
  },
  importedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});;

module.exports = mongoose.model('Customer', customerSchema);