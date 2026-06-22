const { walkDir } = require('./src/services/fileSystem');
require('dotenv').config();

async function run() {
  try {
    const entries = await walkDir('', '/');
    console.log('WALKDIR ENTRIES:', JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}
run();
