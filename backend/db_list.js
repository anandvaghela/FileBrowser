const { getDb, User } = require('./src/db');
require('dotenv').config();

async function run() {
  try {
    await getDb();
    const users = await User.find();
    console.log('USERS:', JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
  process.exit(0);
}
run();
