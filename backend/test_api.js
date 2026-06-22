const { signToken } = require('./src/middleware/auth');
require('dotenv').config();

async function run() {
  const token = signToken({
    id: 1,
    username: 'admin',
    perm: { admin: true }
  });

  console.log('JWT Token signed:', token);

  try {
    const res = await fetch('http://localhost:8080/api/resources/recursive/', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('API RESPONSE STATUS:', res.status);
    const data = await res.json();
    if (res.ok) {
      console.log('API RESPONSE DATA COUNT:', data.length);
      console.log('API RESPONSE DATA SAMPLE:', JSON.stringify(data.slice(0, 3), null, 2));
    } else {
      console.error('API ERROR RESPONSE:', res.status, data);
    }
  } catch (err) {
    console.error('API ERROR:', err.message);
  }
}
run();
