/* ===== TEACHER AUTHENTICATION & MANAGEMENT ROUTES ===== */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');

const { USE_DATABASE, db, TEACHERS_PATH, MATERIALS_PATH, GODADDY_CONFIG } = require('../config/storage');

// ─────────────────────────────────────────────
//  MULTER FILE UPLOAD CONFIGURATION
// ─────────────────────────────────────────────

// Use local uploads folder as staging area
const UPLOAD_DIR = path.join(__dirname, '../../uploads/materials');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.pptx', '.docx', '.mp4', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

// ─────────────────────────────────────────────
//  FILE-MODE HELPERS (fallback when USE_DATABASE=false)
// ─────────────────────────────────────────────

function readTeachers() {
  try {
    if (fs.existsSync(TEACHERS_PATH)) {
      return JSON.parse(fs.readFileSync(TEACHERS_PATH, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('Error reading teachers file:', err);
    return [];
  }
}

function writeTeachers(data) {
  try {
    fs.writeFileSync(TEACHERS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing teachers file:', err);
    return false;
  }
}

function readMaterials() {
  try {
    if (fs.existsSync(MATERIALS_PATH)) {
      return JSON.parse(fs.readFileSync(MATERIALS_PATH, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('Error reading materials file:', err);
    return [];
  }
}

function writeMaterials(data) {
  try {
    fs.writeFileSync(MATERIALS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing materials file:', err);
    return false;
  }
}

// ─────────────────────────────────────────────
//  POST /api/teachers/login
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    let teacher;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT * FROM teachers WHERE email = ? LIMIT 1',
        [email]
      );
      teacher = rows[0];
    } else {
      const teachers = readTeachers();
      teacher = teachers.find(t => t.email === email);
    }

    if (!teacher) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let passwordMatch = false;
    if (typeof teacher.password === 'string' && teacher.password.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, teacher.password);
    } else {
      passwordMatch = password === teacher.password;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (teacher.status !== 'active') {
      return res.status(403).json({ error: 'Teacher account is inactive' });
    }

    res.json({
      success: true,
      token: `teacher_${teacher.id}_${Date.now()}`,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        language: teacher.language,
        department: teacher.department,
        experience: teacher.experience
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ─────────────────────────────────────────────
//  POST /api/teachers/verify
// ─────────────────────────────────────────────
router.post('/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }
    if (token.startsWith('teacher_')) {
      res.json({ valid: true, message: 'Token is valid' });
    } else {
      res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Server error during verification' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/teachers
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let teachers;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id, name, email, language, department, experience, status FROM teachers'
      );
      teachers = rows;
    } else {
      teachers = readTeachers().map(t => ({
        id: t.id, name: t.name, email: t.email,
        language: t.language, department: t.department,
        experience: t.experience, status: t.status
      }));
    }

    res.json(teachers);
  } catch (err) {
    console.error('Get teachers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/teachers/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let teacher;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id, name, email, language, department, experience, joinDate, status FROM teachers WHERE id = ? LIMIT 1',
        [id]
      );
      teacher = rows[0];
    } else {
      teacher = readTeachers().find(t => t.id === id);
    }

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.json(teacher);
  } catch (err) {
    console.error('Get teacher error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  POST /api/teachers/:teacherId/materials
// ─────────────────────────────────────────────
router.post('/:teacherId/materials', upload.single('file'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { title, description, language, level } = req.body;
    const file = req.file;

    if (!title || !language || !level) {
      if (file) fs.unlinkSync(file.path); // clean up
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const type = file ? path.extname(file.originalname).replace('.','').toUpperCase() : 'PDF';
    const fileUrl = file
      ? `${GODADDY_CONFIG.uploadUrl}${file.filename}`
      : '';

    let teacher;
    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id, name FROM teachers WHERE id = ? LIMIT 1',
        [teacherId]
      );
      teacher = rows[0];
    } else {
      teacher = readTeachers().find(t => t.id === teacherId);
    }

    if (!teacher) {
      if (file) fs.unlinkSync(file.path);
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const materialId = `material_${Date.now()}`;
    const createdAt = new Date().toISOString();

    if (USE_DATABASE) {
      await db.execute(
        `INSERT INTO materials
          (id, teacherId, title, description, language, level, type, fileUrl, fileName, fileSize, content, uploadedAt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
        [
          materialId, teacherId, title, description || '',
          language, level, type,
          file ? `${GODADDY_CONFIG.uploadUrl}${file.filename}` : '',
          file ? file.originalname : '',
          file ? file.size : 0,
          '', createdAt
        ]
      );
    } else {
      const materials = readMaterials();
      materials.push({
        id: materialId, teacherId, teacherName: teacher.name,
        title, description: description || '', language, level,
        type, content: fileUrl, createdAt, status: 'published'
      });
      writeMaterials(materials);
    }

    res.status(201).json({
      success: true,
      message: 'Material uploaded successfully',
      material: {
        id: materialId, teacherId, teacherName: teacher.name,
        title, description: description || '', language, level,
        type, content: fileUrl, createdAt, status: 'published'
      }
    });
  } catch (err) {
    console.error('Upload material error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/teachers/:teacherId/materials
// ─────────────────────────────────────────────
router.get('/:teacherId/materials', async (req, res) => {
  try {
    const { teacherId } = req.params;
    let teacher, materials;

    if (USE_DATABASE) {
      const [teacherRows] = await db.execute(
        'SELECT id, name FROM teachers WHERE id = ? LIMIT 1',
        [teacherId]
      );
      teacher = teacherRows[0];

      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

      const [matRows] = await db.execute(
        'SELECT * FROM materials WHERE teacherId = ? ORDER BY uploadedAt DESC',
        [teacherId]
      );
      materials = matRows;
    } else {
      teacher = readTeachers().find(t => t.id === teacherId);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      materials = readMaterials().filter(m => m.teacherId === teacherId);
    }

    res.json({ teacher: teacher.name, materials });
  } catch (err) {
    console.error('Get materials error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/teachers/:teacherId/materials/:materialId
// ─────────────────────────────────────────────
router.delete('/:teacherId/materials/:materialId', async (req, res) => {
  try {
    const { teacherId, materialId } = req.params;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id FROM materials WHERE id = ? AND teacherId = ? LIMIT 1',
        [materialId, teacherId]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Material not found' });

      await db.execute('DELETE FROM materials WHERE id = ?', [materialId]);
    } else {
      const materials = readMaterials();
      const exists = materials.find(m => m.id === materialId && m.teacherId === teacherId);
      if (!exists) return res.status(404).json({ error: 'Material not found' });
      writeMaterials(materials.filter(m => m.id !== materialId));
    }

    res.json({ success: true, message: 'Material deleted' });
  } catch (err) {
    console.error('Delete material error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/teachers/:teacherId/dashboard
// ─────────────────────────────────────────────
router.get('/:teacherId/dashboard', async (req, res) => {
  try {
    const { teacherId } = req.params;
    let teacher, teacherMaterials;

    if (USE_DATABASE) {
      const [teacherRows] = await db.execute(
        'SELECT id, name, email, language, department, experience FROM teachers WHERE id = ? LIMIT 1',
        [teacherId]
      );
      teacher = teacherRows[0];
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

      const [matRows] = await db.execute(
        'SELECT * FROM materials WHERE teacherId = ? ORDER BY uploadedAt DESC',
        [teacherId]
      );
      teacherMaterials = matRows;
    } else {
      teacher = readTeachers().find(t => t.id === teacherId);
      if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
      teacherMaterials = readMaterials().filter(m => m.teacherId === teacherId);
    }

    res.json({
      teacher: {
        id: teacher.id, name: teacher.name, email: teacher.email,
        language: teacher.language, department: teacher.department,
        experience: teacher.experience
      },
      stats: {
        totalMaterials: teacherMaterials.length,
        publishedCount: teacherMaterials.filter(m => m.status === 'published').length,
        languagesTaught: teacher.language
      },
      recentMaterials: teacherMaterials.slice(0, 5)
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;