/* ===== STORAGE CONFIGURATION ===== */
const fs = require('fs');
const path = require('path');

// Determine storage mode from environment
const USE_DATABASE = process.env.USE_DATABASE === 'true';
const STORAGE_MODE = USE_DATABASE ? 'database' : 'file';

// File paths (fallback only)
const TEACHERS_PATH = process.env.TEACHERS_PATH || './data/teachers.json';
const STUDENTS_PATH = process.env.STUDENTS_PATH || './data/students.json';
const MATERIALS_PATH = process.env.MATERIALS_PATH || './data/materials.json';
const SESSIONS_PATH = process.env.SESSION_LOG_PATH || './data/sessions.json';

// GoDaddy MySQL config
const GODADDY_CONFIG = {
  host: (process.env.GODADDY_DB_HOST || 'localhost').trim(),
  user: process.env.GODADDY_DB_USER?.trim(),
  password: process.env.GODADDY_DB_PASSWORD?.trim(),
  database: process.env.GODADDY_DB_NAME?.trim(),
  uploadUrl: process.env.GODADDY_UPLOAD_URL || 'https://lurnr.africa/lurnr-data/materials/',
  uploadPath: process.env.GODADDY_UPLOAD_PATH || '/home/cpaneluser/public_html/lurnr-data/materials/',
  ftpHost: process.env.GODADDY_FTP_HOST || 'ftp.lurnr.africa',
  ftpUser: process.env.GODADDY_FTP_USER || 'uploads@lurnr.africa',
  ftpPassword: process.env.GODADDY_FTP_PASSWORD || 'Lurnr2026!',
  ftpUploadPath: process.env.GODADDY_FTP_UPLOAD_PATH || '/home/xfc9su84kbwb/public_html/lurnr.africa/uploads'
};

// ── MySQL CONNECTION POOL ──
let db = null;

if (USE_DATABASE) {
  try {
    const mysql = require('mysql2/promise');
    db = mysql.createPool({
      host: GODADDY_CONFIG.host,
      user: GODADDY_CONFIG.user,
      password: GODADDY_CONFIG.password,
      database: GODADDY_CONFIG.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000
    });

    // Test connection on startup
    db.getConnection()
      .then(conn => {
        console.log('✅ MySQL connected to GoDaddy database successfully');
        conn.release();
      })
      .catch(err => {
        console.error('❌ MySQL connection failed:', err.message);
        console.error('   Check GODADDY_DB_HOST, GODADDY_DB_USER, GODADDY_DB_PASSWORD in .env');
      });

  } catch (err) {
    console.error('❌ mysql2 not installed. Run: npm install mysql2');
  }
}

/**
 * Ensure data directory exists (file mode fallback)
 */
function ensureDataDir() {
  const dataDir = path.dirname(TEACHERS_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Initialize all data files (file mode fallback only)
 */
function initializeDataFiles() {
  if (USE_DATABASE) {
    // In database mode, just log — no JSON files needed
    return;
  }

  ensureDataDir();

  if (!fs.existsSync(TEACHERS_PATH)) {
    fs.writeFileSync(TEACHERS_PATH, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(STUDENTS_PATH)) {
    fs.writeFileSync(STUDENTS_PATH, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(MATERIALS_PATH)) {
    fs.writeFileSync(MATERIALS_PATH, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(SESSIONS_PATH)) {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify([], null, 2));
  }
}

/**
 * Log storage initialization info
 */
function logStorageInfo() {
  console.log('\n=== DATA STORAGE CONFIGURATION ===');
  console.log(`Mode: ${STORAGE_MODE.toUpperCase()}`);

  if (STORAGE_MODE === 'file') {
    console.log(`Teachers:  ${TEACHERS_PATH}`);
    console.log(`Students:  ${STUDENTS_PATH}`);
    console.log(`Materials: ${MATERIALS_PATH}`);
    console.log(`Sessions:  ${SESSIONS_PATH}`);
    console.log('⚠️  WARNING: File mode active — data will not persist after restarts');
  } else {
    console.log(`Database:  ${GODADDY_CONFIG.database}`);
    console.log(`Host:      ${GODADDY_CONFIG.host}`);
    console.log(`User:      ${GODADDY_CONFIG.user}`);
    console.log(`Upload URL: ${GODADDY_CONFIG.uploadUrl}`);
  }
  console.log('===================================\n');
}

module.exports = {
  STORAGE_MODE,
  USE_DATABASE,
  TEACHERS_PATH,
  STUDENTS_PATH,
  MATERIALS_PATH,
  SESSIONS_PATH,
  GODADDY_CONFIG,
  db,
  ensureDataDir,
  initializeDataFiles,
  logStorageInfo
};