const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

// User model
const UserSchema = new mongoose.Schema({
  companyId: String,
  companyName: String,
  email: String,
  password: String,
  firstName: String,
  lastName: String,
  phone: String,
  address: String,
  businessType: String,
  employees: String,
  description: String,
  handoffPhoneNumber: String,
  role: { type: String, default: 'user' },
  isCompanyAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

async function setAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-calling-system');
    console.log('Connected to MongoDB');
    
    // Set the test user as company admin
    const result = await User.findOneAndUpdate(
      { email: 'admin@test.com' },
      { isCompanyAdmin: true },
      { new: true }
    );
    
    if (result) {
      console.log('Successfully updated user to company admin:', {
        id: result._id,
        email: result.email,
        isCompanyAdmin: result.isCompanyAdmin
      });
    } else {
      console.log('User not found');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

setAdmin();