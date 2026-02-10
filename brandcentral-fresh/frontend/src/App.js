const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'rollodex-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test database connection
pool.connect()
  .then(client => {
    logger.info('✅ ROLLodex database connected successfully');
    client.release();
  })
  .catch(err => {
    logger.error('❌ Database connection failed:', err);
  });

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
const brandUploadsDir = path.join(uploadsDir, 'brands');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(brandUploadsDir)) {
  fs.mkdirSync(brandUploadsDir, { recursive: true });
}

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const brandId = req.params.brandId || req.body.brandId || 'temp';
    const brandDir = path.join(brandUploadsDir, brandId.toString());
    if (!fs.existsSync(brandDir)) {
      fs.mkdirSync(brandDir, { recursive: true });
    }
    cb(null, brandDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|mp4|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, documents, and videos allowed.'));
    }
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('ROLLodex API request processed', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
  });
  
  next();
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_MISSING'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'rollodx-secret-key', (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt', { token: token.substring(0, 10) + '...' });
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const result = await pool.query('SELECT NOW()');
    
    res.json({ 
      status: 'healthy',
      service: 'ROLLodex API',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      uptime: process.uptime(),
      version: '2.0.0',
      dbTime: result.rows[0].now
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'ROLLodex API',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

// Database initialization
async function initDatabase() {
  try {
    logger.info('🔧 Initializing ROLLodex database...');

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        company_name VARCHAR(255),
        company_type VARCHAR(50),
        phone VARCHAR(50),
        title VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create brands table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(100),
        website VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(50),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        logo_url VARCHAR(255),
        profile_completion_score INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT false,
        is_public BOOLEAN DEFAULT true,
        owner_id INTEGER REFERENCES users(id),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create retailers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS retailers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        industry VARCHAR(100),
        website VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(50),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        logo_url VARCHAR(255),
        owner_id INTEGER REFERENCES users(id),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create brand_retailer_relationships table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brand_retailer_relationships (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
        retailer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'prospective',
        partnership_type VARCHAR(100),
        started_date DATE,
        notes TEXT,
        priority VARCHAR(20) DEFAULT 'normal',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(brand_id, retailer_id)
      )
    `);

    // Create brand_products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brand_products (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        sku VARCHAR(100),
        price DECIMAL(10,2),
        image_url VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create brand_assets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS brand_assets (
        id SERIAL PRIMARY KEY,
        brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        file_type VARCHAR(100),
        file_size INTEGER,
        file_path VARCHAR(500),
        file_url VARCHAR(500),
        description TEXT,
        category VARCHAR(100) DEFAULT 'general',
        permission_level VARCHAR(50) DEFAULT 'partners_only',
        download_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT false,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create activity_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        metadata JSONB,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create notification_preferences table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email_notifications BOOLEAN DEFAULT true,
        partnership_updates BOOLEAN DEFAULT true,
        asset_notifications BOOLEAN DEFAULT true,
        weekly_digest BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      )
    `);

    // Create indexes for better performance
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_company_type ON users(company_type)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_brands_owner ON brands(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_brands_industry ON brands(industry)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_brands_public ON brands(is_public)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_relationships_brand ON brand_retailer_relationships(brand_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_relationships_retailer ON brand_retailer_relationships(retailer_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_assets_brand ON brand_assets(brand_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_products_brand ON brand_products(brand_id)');

    logger.info('✅ ROLLodex database tables and indexes created successfully');
    
    // Insert demo data
    await insertDemoData();
    
  } catch (error) {
    logger.error('❌ ROLLodex database initialization failed:', error);
    throw error;
  }
}

async function insertDemoData() {
  try {
    // Check if demo data exists
    const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      logger.info('✅ ROLLodex demo data already exists');
      return;
    }

    logger.info('🌱 Creating ROLLodex demo data...');
    const hashedPassword = await bcrypt.hash('password123', 12);
    
    // Demo retailer users
    const retailerResult = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type, phone, title, email_verified) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, ['admin@freshmarket.example.com', hashedPassword, 'Sarah', 'Johnson', 'retailer_admin', 'Fresh Market Co', 'retailer', '+1-555-0123', 'Head of Procurement', true]);

    const retailer2Result = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type, phone, title, email_verified) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, ['buyer@urbanretail.example.com', hashedPassword, 'Michael', 'Chen', 'retailer_buyer', 'Urban Retail', 'retailer', '+1-555-0456', 'Senior Buyer', true]);

    // Demo brand users
    const brandResult = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type, phone, title, email_verified) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, ['admin@pureelements.example.com', hashedPassword, 'Emma', 'Green', 'brand_admin', 'Pure Elements', 'brand', '+1-555-0789', 'Brand Manager', true]);

    const brand2Result = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type, phone, title, email_verified) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
    `, ['contact@techfoods.example.com', hashedPassword, 'David', 'Kim', 'brand_admin', 'TechFoods Innovation', 'brand', '+1-555-0321', 'Sales Director', true]);

    // Create brand profiles
    const pureElementsBrand = await pool.query(`
      INSERT INTO brands (name, description, industry, website, email, phone, address, city, state, country, postal_code, profile_completion_score, is_verified, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
    `, ['Pure Elements', 'Organic and natural food products made with sustainable practices and premium ingredients sourced from local farms.', 'Natural Foods', 'https://pureelements.com', 'hello@pureelements.com', '+1-555-0789', '789 Green Valley Road', 'Boulder', 'CO', 'USA', '80301', 87, true, brandResult.rows[0].id]);

    const techFoodsBrand = await pool.query(`
      INSERT INTO brands (name, description, industry, website, email, phone, address, city, state, country, postal_code, profile_completion_score, is_verified, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
    `, ['TechFoods Innovation', 'Next-generation food technology company creating innovative snacks and beverages powered by AI-driven nutrition science.', 'Food Technology', 'https://techfoods.io', 'contact@techfoods.io', '+1-555-0321', '321 Innovation Drive', 'Austin', 'TX', 'USA', '73301', 78, false, brand2Result.rows[0].id]);

    // Additional demo brands
    const organicBrand = await pool.query(`
      INSERT INTO brands (name, description, industry, website, email, phone, profile_completion_score, is_public, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, ['Organic Valley Plus', 'Premium organic produce and dairy products from certified sustainable farms', 'Organic Foods', 'https://organicvalleyplus.com', 'info@organicvalleyplus.com', '+1-555-1122', 92, true, brandResult.rows[0].id]);

    const craftBrand = await pool.query(`
      INSERT INTO brands (name, description, industry, website, email, phone, profile_completion_score, is_public, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, ['Craft Beverage Co', 'Artisanal sodas and beverages made with natural ingredients and unique flavor profiles', 'Beverages', 'https://craftbeverage.co', 'hello@craftbeverage.co', '+1-555-3344', 85, true, brand2Result.rows[0].id]);

    // Create retailer profiles
    await pool.query(`
      INSERT INTO retailers (name, description, industry, website, email, phone, address, city, state, country, postal_code, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, ['Fresh Market Co', 'Premium grocery chain specializing in fresh, organic, and locally sourced products with 50+ locations', 'Retail - Grocery', 'https://freshmarketco.com', 'procurement@freshmarketco.com', '+1-555-0123', '123 Market Street', 'Seattle', 'WA', 'USA', '98101', retailerResult.rows[0].id]);

    await pool.query(`
      INSERT INTO retailers (name, description, industry, website, email, phone, address, city, state, country, postal_code, owner_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, ['Urban Retail', 'Modern retail chain focused on emerging brands and innovative products', 'Retail - Specialty', 'https://urbanretail.com', 'buyers@urbanretail.com', '+1-555-0456', '456 Urban Avenue', 'Austin', 'TX', 'USA', '78701', retailer2Result.rows[0].id]);

    // Create brand-retailer relationships
    await pool.query(`
      INSERT INTO brand_retailer_relationships (brand_id, retailer_id, status, partnership_type, started_date, notes, priority, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [pureElementsBrand.rows[0].id, retailerResult.rows[0].id, 'active', 'Preferred Vendor', '2023-08-15', 'Excellent partnership with consistent quality and delivery. One of our top-performing organic brands.', 'high', retailerResult.rows[0].id]);

    await pool.query(`
      INSERT INTO brand_retailer_relationships (brand_id, retailer_id, status, partnership_type, notes, priority, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [techFoodsBrand.rows[0].id, retailer2Result.rows[0].id, 'prospective', 'New Vendor Evaluation', 'Promising new brand with innovative products and strong market potential', 'high', retailer2Result.rows[0].id]);

    await pool.query(`
      INSERT INTO brand_retailer_relationships (brand_id, retailer_id, status, partnership_type, notes, priority, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [organicBrand.rows[0].id, retailerResult.rows[0].id, 'pending', 'Standard Vendor', 'Under consideration for expansion into premium organic lines', 'normal', retailerResult.rows[0].id]);

    // Add demo products
    await pool.query(`
      INSERT INTO brand_products (brand_id, name, description, category, sku, price, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [pureElementsBrand.rows[0].id, 'Organic Quinoa Bowls', 'Ready-to-eat organic quinoa bowls with seasonal vegetables and herbs', 'Prepared Foods', 'PE-QB-001', 12.99, true]);

    await pool.query(`
      INSERT INTO brand_products (brand_id, name, description, category, sku, price, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [pureElementsBrand.rows[0].id, 'Organic Superfood Smoothies', 'Cold-pressed organic superfood smoothies packed with nutrients', 'Beverages', 'PE-SM-002', 8.99, true]);

    await pool.query(`
      INSERT INTO brand_products (brand_id, name, description, category, sku, price, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [techFoodsBrand.rows[0].id, 'Smart Protein Bars', 'AI-optimized nutrition bars with personalized macro profiles', 'Snacks', 'TF-SPB-001', 4.99, true]);

    await pool.query(`
      INSERT INTO brand_products (brand_id, name, description, category, sku, price, is_active) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [craftBrand.rows[0].id, 'Artisan Ginger Fizz', 'Craft ginger soda with real ginger and organic cane sugar', 'Beverages', 'CB-GF-001', 3.49, true]);

    // Create notification preferences for all users
    const allUsers = [retailerResult.rows[0].id, retailer2Result.rows[0].id, brandResult.rows[0].id, brand2Result.rows[0].id];
    for (const userId of allUsers) {
      await pool.query(`
        INSERT INTO notification_preferences (user_id) VALUES ($1)
      `, [userId]);
    }

    logger.info('✅ ROLLodex demo data inserted successfully');
    logger.info('🧪 ROLLodex demo accounts created:');
    logger.info('   🛒 Retailer: admin@freshmarket.example.com / password123');
    logger.info('   🛒 Retailer: buyer@urbanretail.example.com / password123');
    logger.info('   🏷️ Brand: admin@pureelements.example.com / password123');
    logger.info('   🏷️ Brand: contact@techfoods.example.com / password123');
    
  } catch (error) {
    logger.error('❌ ROLLodex demo data insertion failed:', error);
  }
}

// Activity logging function
async function logActivity(userId, action, entityType, entityId, metadata = null, req = null) {
  try {
    await pool.query(`
      INSERT INTO activity_log (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null,
      req?.ip,
      req?.get('User-Agent')
    ]);
  } catch (error) {
    logger.error('Activity logging failed:', error);
  }
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// AUTH ROUTES
app.post('/api/auth/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { email, password } = req.body;
    logger.info('ROLLodex login attempt', { email });

    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    const user = result.rows[0];

    if (!user) {
      logger.warn('Login failed - user not found', { email });
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn('Login failed - invalid password', { email });
      await logActivity(user.id, 'LOGIN_FAILED', 'user', user.id, { reason: 'invalid_password' }, req);
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type
      },
      process.env.JWT_SECRET || 'rollodex-secret-key',
      { expiresIn: '24h' }
    );

    await logActivity(user.id, 'LOGIN_SUCCESS', 'user', user.id, { ip: req.ip }, req);

    logger.info('ROLLodex login successful', { userId: user.id, email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type,
        phone: user.phone,
        title: user.title,
        emailVerified: user.email_verified
      }
    });

  } catch (error) {
    logger.error('ROLLodex login error:', error);
    res.status(500).json({ 
      error: 'Login failed', 
      code: 'SERVER_ERROR'
    });
  }
});

app.post('/api/auth/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').isLength({ min: 1 }).trim(),
  body('lastName').isLength({ min: 1 }).trim(),
  body('companyName').isLength({ min: 1 }).trim(),
  body('companyType').isIn(['retailer', 'brand'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { email, password, firstName, lastName, companyName, companyType, phone, title } = req.body;

    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'An account with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const role = companyType === 'retailer' ? 'retailer_admin' : 'brand_admin';

    const result = await pool.query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, company_type, phone, title) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [email, hashedPassword, firstName, lastName, role, companyName, companyType, phone || null, title || null]);

    const userId = result.rows[0].id;

    // Create associated retailer or brand profile
    if (companyType === 'retailer') {
      await pool.query(`
        INSERT INTO retailers (name, description, owner_id) 
        VALUES ($1, $2, $3)
      `, [companyName, `Retailer profile for ${companyName}`, userId]);
    } else {
      await pool.query(`
        INSERT INTO brands (name, description, profile_completion_score, owner_id) 
        VALUES ($1, $2, $3, $4)
      `, [companyName, `Brand profile for ${companyName}`, 25, userId]);
    }

    // Create notification preferences
    await pool.query(`
      INSERT INTO notification_preferences (user_id) VALUES ($1)
    `, [userId]);

    const token = jwt.sign(
      { 
        id: userId, 
        email, 
        role,
        companyName,
        companyType
      },
      process.env.JWT_SECRET || 'rollodex-secret-key',
      { expiresIn: '24h' }
    );

    await logActivity(userId, 'USER_REGISTERED', 'user', userId, { email, role }, req);

    logger.info('ROLLodex user registered successfully', { userId, email, companyType });

    res.json({
      token,
      user: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        companyName,
        companyType,
        phone,
        title,
        emailVerified: false
      }
    });

  } catch (error) {
    logger.error('ROLLodex registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed', 
      code: 'SERVER_ERROR'
    });
  }
});

// USER ROUTES
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, first_name, last_name, role, company_name, company_type, 
             phone, title, is_active, email_verified, last_login, created_at, updated_at 
      FROM users WHERE id = $1
    `, [req.user.id]);
    
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type,
        phone: user.phone,
        title: user.title,
        isActive: user.is_active,
        emailVerified: user.email_verified,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile', 
      code: 'SERVER_ERROR'
    });
  }
});

app.put('/api/users/profile', authenticateToken, [
  body('firstName').optional().isLength({ min: 1 }).trim(),
  body('lastName').optional().isLength({ min: 1 }).trim(),
  body('phone').optional().trim(),
  body('title').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { firstName, lastName, phone, title } = req.body;
    
    const result = await pool.query(`
      UPDATE users 
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          title = COALESCE($4, title),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 
      RETURNING id, email, first_name, last_name, role, company_name, company_type, phone, title
    `, [firstName, lastName, phone, title, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    await logActivity(req.user.id, 'PROFILE_UPDATED', 'user', req.user.id, { 
      updatedFields: { firstName, lastName, phone, title } 
    }, req);

    const user = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        companyType: user.company_type,
        phone: user.phone,
        title: user.title
      }
    });

  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile', 
      code: 'SERVER_ERROR'
    });
  }
});

// BRAND ROUTES
app.get('/api/brands', authenticateToken, async (req, res) => {
  try {
    const { search, industry, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT b.*, u.company_name as owner_company, u.first_name, u.last_name,
             COUNT(DISTINCT p.id) as product_count,
             COUNT(DISTINCT r.id) as relationship_count
      FROM brands b
      LEFT JOIN users u ON b.owner_id = u.id
      LEFT JOIN brand_products p ON b.id = p.brand_id AND p.is_active = true
      LEFT JOIN brand_retailer_relationships r ON b.id = r.brand_id
      WHERE b.is_public = true
    `;
    
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (b.name ILIKE $${paramCount} OR b.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (industry) {
      paramCount++;
      query += ` AND b.industry = $${paramCount}`;
      params.push(industry);
    }

    query += ` 
      GROUP BY b.id, u.company_name, u.first_name, u.last_name
      ORDER BY b.profile_completion_score DESC, b.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM brands b WHERE b.is_public = true';
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      countQuery += ` AND (b.name ILIKE $${countParamCount} OR b.description ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    if (industry) {
      countParamCount++;
      countQuery += ` AND b.industry = $${countParamCount}`;
      countParams.push(industry);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Log search activity
    await logActivity(req.user.id, 'BRANDS_SEARCHED', 'brand', null, { search, industry, resultCount: result.rows.length }, req);

    res.json({
      brands: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNext: (page * limit) < totalCount,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error('Brands fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch brands', 
      code: 'SERVER_ERROR'
    });
  }
});

app.get('/api/brands/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT b.*, u.company_name as owner_company, u.first_name, u.last_name, u.email as owner_email,
             COUNT(DISTINCT p.id) as product_count,
             COUNT(DISTINCT r.id) as relationship_count,
             COUNT(DISTINCT a.id) as asset_count
      FROM brands b
      LEFT JOIN users u ON b.owner_id = u.id
      LEFT JOIN brand_products p ON b.id = p.brand_id AND p.is_active = true
      LEFT JOIN brand_retailer_relationships r ON b.id = r.brand_id
      LEFT JOIN brand_assets a ON b.id = a.brand_id
      WHERE b.id = $1 AND (b.is_public = true OR b.owner_id = $2)
      GROUP BY b.id, u.company_name, u.first_name, u.last_name, u.email
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Brand not found or access denied',
        code: 'BRAND_NOT_FOUND'
      });
    }

    // Get products
    const productsResult = await pool.query(`
      SELECT * FROM brand_products 
      WHERE brand_id = $1 AND is_active = true 
      ORDER BY created_at DESC LIMIT 10
    `, [id]);

    // Get assets (if user has access)
    const assetsResult = await pool.query(`
      SELECT id, filename, original_name, file_type, file_size, description, category, 
             permission_level, download_count, is_featured, created_at
      FROM brand_assets 
      WHERE brand_id = $1 
      AND (permission_level = 'public' OR $2 = $3)
      ORDER BY is_featured DESC, created_at DESC LIMIT 10
    `, [id, req.user.id, result.rows[0].owner_id]);

    await logActivity(req.user.id, 'BRAND_VIEWED', 'brand', parseInt(id), null, req);

    res.json({
      brand: result.rows[0],
      products: productsResult.rows,
      assets: assetsResult.rows
    });

  } catch (error) {
    logger.error('Brand fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch brand', 
      code: 'SERVER_ERROR'
    });
  }
});

app.put('/api/brands/:id', authenticateToken, [
  body('name').optional().isLength({ min: 1 }).trim(),
  body('description').optional().trim(),
  body('industry').optional().trim(),
  body('website').optional().isURL(),
  body('email').optional().isEmail(),
  body('phone').optional().trim()
], async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    // Verify ownership
    const brandCheck = await pool.query('SELECT owner_id FROM brands WHERE id = $1', [id]);
    if (brandCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }
    
    if (brandCheck.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to edit this brand' });
    }

    const { name, description, industry, website, email, phone, address, city, state, country, postal_code } = req.body;
    
    // Calculate completion score
    const fields = [name, description, industry, website, email, phone, address, city, state];
    const completedFields = fields.filter(field => field && field.trim().length > 0).length;
    const completion_score = Math.round((completedFields / fields.length) * 100);

    const result = await pool.query(`
      UPDATE brands 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          industry = COALESCE($3, industry),
          website = COALESCE($4, website),
          email = COALESCE($5, email),
          phone = COALESCE($6, phone),
          address = COALESCE($7, address),
          city = COALESCE($8, city),
          state = COALESCE($9, state),
          country = COALESCE($10, country),
          postal_code = COALESCE($11, postal_code),
          profile_completion_score = $12,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $13 
      RETURNING *
    `, [name, description, industry, website, email, phone, address, city, state, country, postal_code, completion_score, id]);

    await logActivity(req.user.id, 'BRAND_UPDATED', 'brand', parseInt(id), { 
      updatedFields: { name, description, industry, website, email, phone } 
    }, req);

    res.json({
      message: 'Brand updated successfully',
      brand: result.rows[0]
    });

  } catch (error) {
    logger.error('Brand update error:', error);
    res.status(500).json({ 
      error: 'Failed to update brand', 
      code: 'SERVER_ERROR'
    });
  }
});

// Get my brands (for brand owners)
app.get('/api/brands/my/brands', authenticateToken, async (req, res) => {
  try {
    if (!req.user.role.includes('brand')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT b.*, 
             COUNT(DISTINCT p.id) as product_count,
             COUNT(DISTINCT r.id) as relationship_count,
             COUNT(DISTINCT a.id) as asset_count
      FROM brands b
      LEFT JOIN brand_products p ON b.id = p.brand_id AND p.is_active = true
      LEFT JOIN brand_retailer_relationships r ON b.id = r.brand_id
      LEFT JOIN brand_assets a ON b.id = a.brand_id
      WHERE b.owner_id = $1
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `, [req.user.id]);

    res.json({ brands: result.rows });

  } catch (error) {
    logger.error('My brands fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch brands', 
      code: 'SERVER_ERROR'
    });
  }
});

// ASSET ROUTES
app.post('/api/brands/:brandId/assets', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const { brandId } = req.params;
    const { description, category = 'general', permission_level = 'partners_only' } = req.body;

    // Verify brand ownership or admin access
    const brandResult = await pool.query('SELECT owner_id FROM brands WHERE id = $1', [brandId]);
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const isOwner = brandResult.rows[0].owner_id === req.user.id;
    const isAdmin = req.user.role.includes('admin');
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to upload assets for this brand' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedAssets = [];

    for (const file of req.files) {
      const fileUrl = `/uploads/brands/${brandId}/${file.filename}`;
      
      const assetResult = await pool.query(`
        INSERT INTO brand_assets (brand_id, filename, original_name, file_type, file_size, file_path, file_url, description, category, permission_level, uploaded_by) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
      `, [
        brandId,
        file.filename,
        file.originalname,
        file.mimetype,
        file.size,
        file.path,
        fileUrl,
        description || null,
        category,
        permission_level,
        req.user.id
      ]);

      uploadedAssets.push(assetResult.rows[0]);

      await logActivity(req.user.id, 'ASSET_UPLOADED', 'brand_asset', assetResult.rows[0].id, {
        brandId,
        filename: file.originalname,
        permission_level,
        category
      }, req);
    }

    logger.info('ROLLodex assets uploaded successfully', { brandId, count: uploadedAssets.length, userId: req.user.id });

    res.json({
      message: `${uploadedAssets.length} asset(s) uploaded successfully`,
      assets: uploadedAssets
    });

  } catch (error) {
    logger.error('Asset upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload assets', 
      code: 'SERVER_ERROR'
    });
  }
});

app.get('/api/brands/:brandId/assets', authenticateToken, async (req, res) => {
  try {
    const { brandId } = req.params;

    // Check if user has access to this brand's assets
    const brandResult = await pool.query('SELECT owner_id, is_public FROM brands WHERE id = $1', [brandId]);
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const isOwner = brandResult.rows[0].owner_id === req.user.id;
    const isPublicBrand = brandResult.rows[0].is_public;

    let assetsQuery = `
      SELECT * FROM brand_assets 
      WHERE brand_id = $1 
    `;
    
    if (!isOwner) {
      if (isPublicBrand) {
        assetsQuery += ` AND permission_level IN ('public', 'partners_only')`;
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    assetsQuery += ` ORDER BY is_featured DESC, created_at DESC`;

    const result = await pool.query(assetsQuery, [brandId]);

    res.json({ assets: result.rows });

  } catch (error) {
    logger.error('Assets fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assets', 
      code: 'SERVER_ERROR'
    });
  }
});

app.delete('/api/brands/:brandId/assets/:assetId', authenticateToken, async (req, res) => {
  try {
    const { brandId, assetId } = req.params;

    // Verify ownership
    const assetResult = await pool.query(`
      SELECT a.*, b.owner_id 
      FROM brand_assets a 
      JOIN brands b ON a.brand_id = b.id 
      WHERE a.id = $1 AND a.brand_id = $2
    `, [assetId, brandId]);

    if (assetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (assetResult.rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this asset' });
    }

    // Delete file from disk
    const filePath = assetResult.rows[0].file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await pool.query('DELETE FROM brand_assets WHERE id = $1', [assetId]);

    await logActivity(req.user.id, 'ASSET_DELETED', 'brand_asset', parseInt(assetId), {
      brandId: parseInt(brandId),
      filename: assetResult.rows[0].original_name
    }, req);

    res.json({ message: 'Asset deleted successfully' });

  } catch (error) {
    logger.error('Asset deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete asset', 
      code: 'SERVER_ERROR'
    });
  }
});

// ANALYTICS ROUTES
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
  try {
    const stats = {};

    if (req.user.role.includes('retailer')) {
      // Retailer analytics
      const relationshipsResult = await pool.query(
        'SELECT COUNT(*) as total, status FROM brand_retailer_relationships WHERE retailer_id = $1 GROUP BY status',
        [req.user.id]
      );

      const totalBrandsResult = await pool.query(
        'SELECT COUNT(DISTINCT brand_id) as total FROM brand_retailer_relationships WHERE retailer_id = $1',
        [req.user.id]
      );

      const recentActivityResult = await pool.query(`
        SELECT COUNT(*) as count 
        FROM activity_log 
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
      `, [req.user.id]);

      stats.relationships = relationshipsResult.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.total);
        return acc;
      }, {});

      stats.totalBrands = parseInt(totalBrandsResult.rows[0]?.total || 0);
      stats.recentActivity = parseInt(recentActivityResult.rows[0]?.count || 0);

    } else if (req.user.role.includes('brand')) {
      // Brand analytics
      const brandResult = await pool.query('SELECT id FROM brands WHERE owner_id = $1', [req.user.id]);
      
      if (brandResult.rows.length > 0) {
        const brandId = brandResult.rows[0].id;

        const relationshipsResult = await pool.query(
          'SELECT COUNT(*) as total, status FROM brand_retailer_relationships WHERE brand_id = $1 GROUP BY status',
          [brandId]
        );

        const assetsResult = await pool.query(
          'SELECT COUNT(*) as total, SUM(download_count) as total_downloads FROM brand_assets WHERE brand_id = $1',
          [brandId]
        );

        const productsResult = await pool.query(
          'SELECT COUNT(*) as total FROM brand_products WHERE brand_id = $1 AND is_active = true',
          [brandId]
        );

        stats.relationships = relationshipsResult.rows.reduce((acc, row) => {
          acc[row.status] = parseInt(row.total);
          return acc;
        }, {});

        stats.totalAssets = parseInt(assetsResult.rows[0]?.total || 0);
        stats.totalDownloads = parseInt(assetsResult.rows[0]?.total_downloads || 0);
        stats.totalProducts = parseInt(productsResult.rows[0]?.total || 0);
      }
    }

    res.json({ stats });

  } catch (error) {
    logger.error('Analytics fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics', 
      code: 'SERVER_ERROR'
    });
  }
});

// RELATIONSHIPS ROUTES
app.get('/api/relationships', authenticateToken, async (req, res) => {
  try {
    let query;
    let params = [req.user.id];

    if (req.user.role.includes('retailer')) {
      // Get relationships from retailer perspective
      query = `
        SELECT r.*, b.name as brand_name, b.description as brand_description, 
               b.industry, b.website, b.profile_completion_score, b.is_verified,
               u.first_name, u.last_name, u.email as brand_contact_email,
               COUNT(DISTINCT p.id) as product_count,
               COUNT(DISTINCT a.id) as asset_count
        FROM brand_retailer_relationships r
        JOIN brands b ON r.brand_id = b.id
        JOIN users u ON b.owner_id = u.id
        LEFT JOIN brand_products p ON b.id = p.brand_id AND p.is_active = true
        LEFT JOIN brand_assets a ON b.id = a.brand_id
        WHERE r.retailer_id = $1
        GROUP BY r.id, b.id, b.name, b.description, b.industry, b.website, b.profile_completion_score, b.is_verified, u.first_name, u.last_name, u.email
        ORDER BY r.priority DESC, r.updated_at DESC
      `;
    } else {
      // Get relationships from brand perspective
      query = `
        SELECT r.*, ret.name as retailer_name, ret.description as retailer_description,
               ret.industry as retailer_industry, ret.website as retailer_website,
               u.first_name, u.last_name, u.email as retailer_contact_email
        FROM brand_retailer_relationships r
        JOIN brands b ON r.brand_id = b.id
        LEFT JOIN retailers ret ON r.retailer_id = ret.owner_id
        JOIN users u ON r.retailer_id = u.id
        WHERE b.owner_id = $1
        ORDER BY r.priority DESC, r.updated_at DESC
      `;
    }

    const result = await pool.query(query, params);
    res.json({ relationships: result.rows });

  } catch (error) {
    logger.error('Relationships fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch relationships', 
      code: 'SERVER_ERROR'
    });
  }
});

app.post('/api/relationships', authenticateToken, [
  body('brandId').isInt(),
  body('status').isIn(['prospective', 'pending', 'active', 'inactive']),
  body('partnershipType').optional().trim(),
  body('notes').optional().trim(),
  body('priority').optional().isIn(['low', 'normal', 'high'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { brandId, status, partnershipType, notes, priority = 'normal' } = req.body;

    // Verify brand exists and is accessible
    const brandResult = await pool.query('SELECT id FROM brands WHERE id = $1 AND is_public = true', [brandId]);
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ error: 'Brand not found or not accessible' });
    }

    // Check if relationship already exists
    const existingResult = await pool.query(
      'SELECT id FROM brand_retailer_relationships WHERE brand_id = $1 AND retailer_id = $2',
      [brandId, req.user.id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Relationship already exists' });
    }

    const result = await pool.query(`
      INSERT INTO brand_retailer_relationships (brand_id, retailer_id, status, partnership_type, notes, priority, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [brandId, req.user.id, status, partnershipType, notes, priority, req.user.id]);

    await logActivity(req.user.id, 'RELATIONSHIP_CREATED', 'brand_retailer_relationship', result.rows[0].id, {
      brandId,
      status,
      partnershipType,
      priority
    }, req);

    res.json({
      message: 'Relationship created successfully',
      relationship: result.rows[0]
    });

  } catch (error) {
    logger.error('Relationship creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create relationship', 
      code: 'SERVER_ERROR'
    });
  }
});

app.put('/api/relationships/:id', authenticateToken, [
  body('status').optional().isIn(['prospective', 'pending', 'active', 'inactive']),
  body('partnershipType').optional().trim(),
  body('notes').optional().trim(),
  body('priority').optional().isIn(['low', 'normal', 'high'])
], async (req, res) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    // Verify ownership
    const relationshipResult = await pool.query(
      'SELECT * FROM brand_retailer_relationships WHERE id = $1 AND retailer_id = $2',
      [id, req.user.id]
    );

    if (relationshipResult.rows.length === 0) {
      return res.status(404).json({ error: 'Relationship not found or access denied' });
    }

    const { status, partnershipType, notes, priority, startedDate } = req.body;
    
    const result = await pool.query(`
      UPDATE brand_retailer_relationships 
      SET status = COALESCE($1, status),
          partnership_type = COALESCE($2, partnership_type),
          notes = COALESCE($3, notes),
          priority = COALESCE($4, priority),
          started_date = COALESCE($5, started_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 
      RETURNING *
    `, [status, partnershipType, notes, priority, startedDate, id]);

    await logActivity(req.user.id, 'RELATIONSHIP_UPDATED', 'brand_retailer_relationship', parseInt(id), {
      updatedFields: { status, partnershipType, notes, priority }
    }, req);

    res.json({
      message: 'Relationship updated successfully',
      relationship: result.rows[0]
    });

  } catch (error) {
    logger.error('Relationship update error:', error);
    res.status(500).json({ 
      error: 'Failed to update relationship', 
      code: 'SERVER_ERROR'
    });
  }
});

app.delete('/api/relationships/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const relationshipResult = await pool.query(
      'SELECT brand_id FROM brand_retailer_relationships WHERE id = $1 AND retailer_id = $2',
      [id, req.user.id]
    );

    if (relationshipResult.rows.length === 0) {
      return res.status(404).json({ error: 'Relationship not found or access denied' });
    }

    await pool.query('DELETE FROM brand_retailer_relationships WHERE id = $1', [id]);

    await logActivity(req.user.id, 'RELATIONSHIP_DELETED', 'brand_retailer_relationship', parseInt(id), {
      brandId: relationshipResult.rows[0].brand_id
    }, req);

    res.json({ message: 'Relationship deleted successfully' });

  } catch (error) {
    logger.error('Relationship deletion error:', error);
    res.status(500).json({ 
      error: 'Failed to delete relationship', 
      code: 'SERVER_ERROR'
    });
  }
});

// Get available industries for filtering
app.get('/api/industries', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT industry 
      FROM brands 
      WHERE industry IS NOT NULL AND industry != '' 
      ORDER BY industry
    `);

    const industries = result.rows.map(row => row.industry);
    res.json({ industries });

  } catch (error) {
    logger.error('Industries fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch industries', 
      code: 'SERVER_ERROR'
    });
  }
});

// Serve React frontend build files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files
  app.use(express.static(path.join(__dirname, 'build')));
  
  // Handle React routing - send all non-API requests to React app
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  logger.warn('ROLLodex API route not found', { path: req.path, method: req.method });
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('ROLLodx global error handler:', error);

  // Multer errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files. Maximum is 10 files.' });
  }

  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({ error: error.message });
  }

  // Database errors
  if (error.code === '23505') {
    return res.status(400).json({ error: 'Duplicate entry detected' });
  }

  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found' });
  }

  res.status(500).json({ 
    error: 'Internal server error', 
    code: 'SERVER_ERROR'
  });
});

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`🚀 ROLLodex API server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  
  try {
    // Initialize database
    await initDatabase();
    logger.info('🎉 ROLLodex API is ready and running!');
  } catch (error) {
    logger.error('Failed to initialize ROLLodex database:', error);
    // Don't exit, let it try to connect later
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down ROLLodex API gracefully`);
  
  server.close(async () => {
    try {
      await pool.end();
      logger.info('ROLLodex database connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during ROLLodx shutdown:', error);
      process.exit(1);
    }
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close ROLLodex connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
