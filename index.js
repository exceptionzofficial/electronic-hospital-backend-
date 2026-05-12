require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());
app.use(fileUpload());

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS Users (
        id SERIAL PRIMARY KEY,
        fullName VARCHAR(255),
        phone VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        address TEXT,
        profilePhotoUrl TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS RepairRequests (
        id SERIAL PRIMARY KEY,
        userId INTEGER,
        customerName VARCHAR(255),
        deviceType VARCHAR(255),
        brand VARCHAR(255),
        model VARCHAR(255),
        issue TEXT,
        photoUrl TEXT,
        status VARCHAR(255) DEFAULT 'Pending Assignment',
        adminMessage TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Safely add new columns if table already exists
    try { await pool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS phone VARCHAR(255)'); } catch(e){}
    try { await pool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS address TEXT'); } catch(e){}
    try { await pool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS profilePhotoUrl TEXT'); } catch(e){}
    try { await pool.query('ALTER TABLE RepairRequests ADD COLUMN IF NOT EXISTS adminMessage TEXT'); } catch(e){}

    // Fix userId type mismatch if it exists
    try { 
      await pool.query('ALTER TABLE RepairRequests ALTER COLUMN userId TYPE INTEGER USING userId::integer'); 
    } catch(e) {
      console.log("RepairRequests.userId already INTEGER or table empty.");
    }

    console.log("Connected to Neon DB and Verified Tables.");
  } catch (err) {
    console.error("Database connection error: ", err);
  }
}
initDB();

// ─── Health check ───
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Electronic Hospital API is running' });
});

// ─── Helper: Upload to Cloudinary ───
async function uploadToCloudinary(file, folder) {
  const fileBase64 = Buffer.from(file.data).toString('base64');
  const dataURI = "data:" + file.mimetype + ";base64," + fileBase64;
  const result = await cloudinary.uploader.upload(dataURI, { folder });
  return result.secure_url;
}

// ─── AUTH API ───
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, phone, email, password, address } = req.body;
    
    const existCheck = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (existCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Handle profile photo upload
    let profilePhotoUrl = '';
    if (req.files && req.files.profilePhoto) {
      profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto, 'electronic_hospital/profiles');
    }

    const newUser = await pool.query(
      'INSERT INTO Users(fullName, phone, email, password, address, profilePhotoUrl) VALUES($1, $2, $3, $4, $5, $6) RETURNING id, fullName, phone, email, address, profilePhotoUrl',
      [fullName, phone, email, hashedPassword, address || '', profilePhotoUrl]
    );

    const u = newUser.rows[0];
    res.json({ 
      success: true, 
      user: { id: u.id, fullName: u.fullname, phone: u.phone, email: u.email, address: u.address, profilePhotoUrl: u.profilephotourl } 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (user.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

    const u = user.rows[0];
    res.json({ 
      success: true, 
      user: { id: u.id, fullName: u.fullname, phone: u.phone, email: u.email, address: u.address, profilePhotoUrl: u.profilephotourl }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── REPAIR API ───
app.post('/api/requests', async (req, res) => {
  try {
    const { userId, customerName, deviceType, brand, model, issue } = req.body;
    let photoUrl = '';

    if (req.files && req.files.photo) {
      photoUrl = await uploadToCloudinary(req.files.photo, 'electronic_hospital');
    }

    const result = await pool.query(
      `INSERT INTO RepairRequests(userId, customerName, deviceType, brand, model, issue, photoUrl) 
       VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [parseInt(userId), customerName, deviceType, brand, model, issue, photoUrl]
    );

    res.status(201).json({ success: true, request: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/requests/:userId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM RepairRequests WHERE userId = $1 ORDER BY created_at DESC', [req.params.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ADMIN API ───
app.get('/api/admin/requests', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.phone as "customerPhone", u.address as "customerAddress" 
      FROM RepairRequests r 
      LEFT JOIN Users u ON r.userid = u.id 
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("GET /api/admin/requests error:", error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/requests/:id', async (req, res) => {
  try {
    const { status, adminMessage } = req.body;
    
    if (adminMessage) {
      await pool.query('UPDATE RepairRequests SET status = $1, adminMessage = $2 WHERE id = $3', [status, adminMessage, req.params.id]);
    } else {
      await pool.query('UPDATE RepairRequests SET status = $1 WHERE id = $2', [status, req.params.id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ADMIN USERS API ───
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, fullName, phone, email, address, profilePhotoUrl, created_at FROM Users ORDER BY created_at DESC');
    const users = result.rows.map(u => ({
      id: u.id,
      fullName: u.fullname,
      phone: u.phone,
      email: u.email,
      address: u.address,
      profilePhotoUrl: u.profilephotourl,
      createdAt: u.created_at,
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

module.exports = app;
