require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  try {
    const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'repairrequests'
    `);
    console.log("RepairRequests Columns:");
    res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));

    const res2 = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'users'
    `);
    console.log("\nUsers Columns:");
    res2.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));
    
  } catch (err) {
    console.error("Check failed:", err);
  } finally {
    await pool.end();
  }
}

check();
