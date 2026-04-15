import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.development.local' });
dotenv.config({ path: '.env' });

const { DB_URI, DB_NAME } = process.env;

if (!DB_URI) {
  throw new Error('DB_URI is missing');
}

await mongoose.connect(DB_URI, { dbName: DB_NAME || undefined });
const users = mongoose.connection.collection('users');

await users.updateMany({ membershipCode: null }, { $unset: { membershipCode: '' } });

try {
  await users.dropIndex('membershipCode_1');
  console.log('Dropped old membershipCode_1 index');
} catch (error) {
  console.log('dropIndex skipped:', error.codeName || error.message);
}

await users.createIndex(
  { membershipCode: 1 },
  {
    unique: true,
    partialFilterExpression: { membershipCode: { $type: 'string' } },
    name: 'membershipCode_1',
  }
);
console.log('Created partial unique membershipCode_1 index');

await mongoose.disconnect();
