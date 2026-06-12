const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  companyId: {
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
    required: true
  },
  time: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    required: true
  },
  result: {
    type: String,
    required: true
  },
  callResult: {
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
    required: false
  },
  email: {
    type: String,
    required: false
  },
  company: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

export default mongoose.models.Customer || mongoose.model('Customer', customerSchema);