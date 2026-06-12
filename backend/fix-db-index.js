// Fix MongoDB index issue
const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('callsessions');
    
    // List current indexes
    console.log('\nCurrent indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(JSON.stringify(index, null, 2));
    });
    
    // Drop the problematic index
    try {
      console.log('\nDropping twilioCallSid_1 index...');
      await collection.dropIndex('twilioCallSid_1');
      console.log('Index dropped successfully');
    } catch (error) {
      console.log('Index might not exist:', error.message);
    }
    
    // Create a new sparse index that ignores null values
    console.log('\nCreating new sparse index for twilioCallSid...');
    await collection.createIndex(
      { twilioCallSid: 1 },
      { 
        unique: true,
        sparse: true
      }
    );
    console.log('New sparse index created successfully');
    
    // Clean up documents with null twilioCallSid that are old
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log('\nCleaning up old sessions with null twilioCallSid...');
    const deleteResult = await collection.deleteMany({
      twilioCallSid: null,
      createdAt: { $lt: cutoffDate }
    });
    console.log(`Deleted ${deleteResult.deletedCount} old sessions with null twilioCallSid`);
    
    // Update status of stuck sessions
    console.log('\nUpdating stuck sessions...');
    const updateResult = await collection.updateMany(
      {
        status: { $in: ['initiating', 'calling', 'in-progress', 'ai-responding'] },
        startTime: { $lt: cutoffDate }
      },
      {
        $set: {
          status: 'completed',
          endTime: new Date()
        }
      }
    );
    console.log(`Updated ${updateResult.modifiedCount} stuck sessions`);
    
    console.log('\n✅ Database fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixIndex();