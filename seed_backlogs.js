require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runSeed() {
  const dummyData = [
    {
      userId: 'user_123',
      customerName: 'Alice Smith',
      deviceType: 'Phone',
      brand: 'Apple',
      model: 'iPhone 13 Pro',
      issue: 'Screen is completely shattered after dropping on concrete. Sometimes ghost touches happen.',
      photoUrl: 'https://res.cloudinary.com/dolgfnxht/image/upload/v1/sample.jpg',
      status: 'Pending Assignment'
    },
    {
      userId: 'user_124',
      customerName: 'John Doe',
      deviceType: 'Laptop',
      brand: 'Dell',
      model: 'XPS 15',
      issue: 'Keyboard keys stick, and battery drains from 100% to 0 in 30 minutes.',
      photoUrl: 'https://res.cloudinary.com/dolgfnxht/image/upload/v1/sample.jpg',
      status: 'In Progress'
    },
    {
      userId: 'user_125',
      customerName: 'Mary Higgins',
      deviceType: 'TV',
      brand: 'Samsung',
      model: 'QLED 65"',
      issue: 'Powers on but there is no picture, only sound. Occasional blue line spanning horizontally.',
      photoUrl: 'https://res.cloudinary.com/dolgfnxht/image/upload/v1/sample.jpg',
      status: 'Completed'
    },
    {
      userId: 'user_126',
      customerName: 'David Lee',
      deviceType: 'PC',
      brand: 'Custom Build',
      model: 'Gaming Rig',
      issue: 'Random blue screen of deaths during heavy processing. Fans are extremely loud.',
      photoUrl: 'https://res.cloudinary.com/dolgfnxht/image/upload/v1/sample.jpg',
      status: 'Pending Assignment'
    }
  ];

  try {
    console.log("Clearing old records...");
    await pool.query('DELETE FROM RepairRequests');
    
    console.log("Injecting specific backlog records into Neon PostgreSQL...");
    for (const item of dummyData) {
      await pool.query(
        `INSERT INTO RepairRequests(userId, customerName, deviceType, brand, model, issue, photoUrl, status) 
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [item.userId, item.customerName, item.deviceType, item.brand, item.model, item.issue, item.photoUrl, item.status]
      );
    }
    console.log("Successfully seeded backlog data! Your API and apps will now show dynamic orders.");
  } catch(e) {
    console.error("Error inserting data", e);
  } finally {
    pool.end();
  }
}
runSeed();
