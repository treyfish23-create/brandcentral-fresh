const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Connect to database
db.connect().then(() => {
  console.log('✅ Database connected successfully');
}).catch(err => {
  console.error('❌ Database connection failed:', err);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize database tables
async function initDatabase() {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        company_name VARCHAR(255),
        company_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create brands table
    await db.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(100),
        website VARCHAR(255),
        logo_url VARCHAR(255),
        owner_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create relationships table
    await db.query(`
      CREATE TABLE IF NOT EXISTS brand_relationships (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER REFERENCES brands(id),
        retailer_id INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
    
    // Insert demo data
    await insertDemoData();
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
}

async function insertDemoData() {
  try {
    // Check if demo data exists
    const existingUsers = await db.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      console.log('✅ Demo data already exists');
      return;
    }

    // Create demo users
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    // Demo retailer
    const retailerResult = await db.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      ['admin@freshmarket.example.com', hashedPassword, 'Sarah', 'Johnson', 'retailer_admin', 'Fresh Market Co', 'retailer']
    );

    // Demo brand
    const brandUserResult = await db.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      ['admin@pureelements.example.com', hashedPassword, 'Emma', 'Green', 'brand_admin', 'Pure Elements', 'brand']
    );

    // Create demo brand
    const brandResult = await db.query(
      'INSERT INTO brands (name, description, industry, website, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Pure Elements', 'Organic and natural food products', 'Natural Foods', 'https://pureelements.com', brandUserResult.rows[0].id]
    );

    // Create relationship
    await db.query(
      'INSERT INTO brand_relationships (brand_id, retailer_id, status, notes) VALUES ($1, $2, $3, $4)',
      [brandResult.rows[0].id, retailerResult.rows[0].id, 'active', 'Great partnership, high-quality products']
    );

    console.log('✅ Demo data inserted successfully');
  } catch (error) {
    console.error('❌ Demo data insertion failed:', error);
  }
}

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, companyName, companyType } = req.body;

    if (!email || !password || !firstName || !lastName || !companyName || !companyType) {
      return res.status(400).json({ error: 'All fields required' });
    }

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const role = companyType === 'retailer' ? 'retailer_admin' : 'brand_admin';

    const result = await db.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [email, hashedPassword, firstName, lastName, role, companyName, companyType]
    );

    const token = jwt.sign(
      { 
        id: result.rows[0].id, 
        email, 
        role 
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: result.rows[0].id,
        email,
        firstName,
        lastName,
        role,
        companyName,
        companyType
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Protected routes
app.get('/api/brands', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT b.*, u.company_name as owner_company
      FROM brands b
      LEFT JOIN users u ON b.owner_id = u.id
      ORDER BY b.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Brands fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT id, email, first_name, last_name, role, company_name, company_type FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  
  // Serve static files
  app.use(express.static(path.join(__dirname, 'build')));
  
  // Handle React routing - send all non-API requests to React app
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Brand Central API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  
  // Initialize database
  await initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    db.end();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    db.end();
    process.exit(0);
  });
});

module.exports = app;
