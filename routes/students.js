/* ===== STUDENT MANAGEMENT ROUTES ===== */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const { USE_DATABASE, db, STUDENTS_PATH } = require('../config/storage');

const SALT_ROUNDS = 10;

// ─────────────────────────────────────────────
//  FILE-MODE HELPERS (fallback when USE_DATABASE=false)
// ─────────────────────────────────────────────

function readStudents() {
  try {
    if (fs.existsSync(STUDENTS_PATH)) {
      return JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf-8'));
    }
    return [];
  } catch (err) {
    console.error('Error reading students file:', err);
    return [];
  }
}

function writeStudents(data) {
  try {
    fs.writeFileSync(STUDENTS_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing students file:', err);
    return false;
  }
}

// ─────────────────────────────────────────────
//  POST /api/students
//  Enroll a new student
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, email, password, language, proficiencyLevel, teacherId } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const id = `student_${Date.now()}`;
    const enrollDate = new Date().toISOString();
    const lastActive = enrollDate;
    const status = 'active';
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    if (USE_DATABASE) {
      // Check duplicate
      const [existing] = await db.execute(
        'SELECT id FROM students WHERE email = ? LIMIT 1', [email]
      );
      if (existing.length) {
        return res.status(409).json({ error: 'Student already exists' });
      }

      await db.execute(
        `INSERT INTO students (id, teacherId, name, email, password, language, proficiencyLevel, enrollDate, lastActive, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, teacherId || '', name, email, hashedPassword, language || null, proficiencyLevel || null, enrollDate, lastActive, status]
      );
    } else {
      const students = readStudents();
      if (students.find(s => s.email === email)) {
        return res.status(409).json({ error: 'Student already exists' });
      }
      students.push({ id, teacherId: teacherId || null, name, email, password: hashedPassword, language: language || null, proficiencyLevel: proficiencyLevel || null, enrollDate, lastActive, status });
      writeStudents(students);
    }

    // Never return password in response
    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully',
      student: { id, teacherId: teacherId || null, name, email, language: language || null, proficiencyLevel: proficiencyLevel || null, enrollDate, lastActive, status }
    });
  } catch (err) {
    console.error('Enroll student error:', err);
    res.status(500).json({ error: 'Server error during enrollment' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/students
//  Get all students (optional ?teacherId= or ?search=)
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { teacherId, search } = req.query;
    let students;

    if (USE_DATABASE) {
      let query = 'SELECT id, teacherId, name, email, language, proficiencyLevel, enrollDate, lastActive, status FROM students WHERE 1=1';
      const params = [];

      if (teacherId) {
        query += ' AND teacherId = ?';
        params.push(teacherId);
      }
      if (search) {
        query += ' AND (name LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      const [rows] = await db.execute(query, params);
      students = rows;
    } else {
      students = readStudents().map(({ password, ...s }) => s); // strip password
      if (teacherId) students = students.filter(s => s.teacherId === teacherId);
      if (search) {
        const q = search.toLowerCase();
        students = students.filter(s =>
          s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
        );
      }
    }

    res.json({ count: students.length, students });
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/students/:id
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let student;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id, teacherId, name, email, language, proficiencyLevel, enrollDate, lastActive, status FROM students WHERE id = ? LIMIT 1', [id]
      );
      student = rows[0];
    } else {
      const found = readStudents().find(s => s.id === id);
      if (found) {
        const { password, ...rest } = found;
        student = rest;
      }
    }

    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    console.error('Get student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  PUT /api/students/:id
//  Update student info
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, language, proficiencyLevel, status } = req.body;
    const lastActive = new Date().toISOString();

    if (USE_DATABASE) {
      const [existing] = await db.execute(
        'SELECT * FROM students WHERE id = ? LIMIT 1', [id]
      );
      if (!existing.length) return res.status(404).json({ error: 'Student not found' });

      await db.execute(
        `UPDATE students SET
          name = COALESCE(?, name),
          language = COALESCE(?, language),
          proficiencyLevel = COALESCE(?, proficiencyLevel),
          status = COALESCE(?, status),
          lastActive = ?
         WHERE id = ?`,
        [name || null, language || null, proficiencyLevel || null, status || null, lastActive, id]
      );

      const [updated] = await db.execute(
        'SELECT id, teacherId, name, email, language, proficiencyLevel, enrollDate, lastActive, status FROM students WHERE id = ? LIMIT 1', [id]
      );
      return res.json({ success: true, message: 'Student updated', student: updated[0] });
    } else {
      const students = readStudents();
      const idx = students.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Student not found' });

      students[idx] = {
        ...students[idx],
        name: name || students[idx].name,
        language: language || students[idx].language,
        proficiencyLevel: proficiencyLevel || students[idx].proficiencyLevel,
        status: status || students[idx].status,
        lastActive
      };
      writeStudents(students);
      const { password, ...rest } = students[idx];
      return res.json({ success: true, message: 'Student updated', student: rest });
    }
  } catch (err) {
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/students/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (USE_DATABASE) {
      const [existing] = await db.execute(
        'SELECT id FROM students WHERE id = ? LIMIT 1', [id]
      );
      if (!existing.length) return res.status(404).json({ error: 'Student not found' });
      await db.execute('DELETE FROM students WHERE id = ?', [id]);
    } else {
      const students = readStudents();
      const filtered = students.filter(s => s.id !== id);
      if (filtered.length === students.length) return res.status(404).json({ error: 'Student not found' });
      writeStudents(filtered);
    }

    res.json({ success: true, message: 'Student removed' });
  } catch (err) {
    console.error('Delete student error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/students/teacher/:teacherId
//  Get all students for a specific teacher
// ─────────────────────────────────────────────
router.get('/teacher/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    let students;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT id, teacherId, name, email, language, proficiencyLevel, enrollDate, lastActive, status FROM students WHERE teacherId = ?', [teacherId]
      );
      students = rows;
    } else {
      students = readStudents()
        .filter(s => s.teacherId === teacherId)
        .map(({ password, ...s }) => s);
    }

    res.json({ teacherId, count: students.length, students });
  } catch (err) {
    console.error('Get teacher students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  POST /api/students/login
//  Authenticate student by email + password
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    let student;

    if (USE_DATABASE) {
      const [rows] = await db.execute(
        'SELECT * FROM students WHERE email = ? LIMIT 1', [email]
      );
      student = rows[0];
    } else {
      student = readStudents().find(s => s.email === email);
    }

    if (!student) return res.status(401).json({ error: 'No account found with that email' });
    if (student.status !== 'active') return res.status(403).json({ error: 'Account is inactive' });

    // Verify password against bcrypt hash
    const passwordMatch = await bcrypt.compare(password, student.password);
    if (!passwordMatch) return res.status(401).json({ error: 'Incorrect password' });

    // Update lastActive
    const now = new Date().toISOString();
    if (USE_DATABASE) {
      await db.execute('UPDATE students SET lastActive = ? WHERE id = ?', [now, student.id]);
    } else {
      const students = readStudents();
      const idx = students.findIndex(s => s.id === student.id);
      if (idx !== -1) { students[idx].lastActive = now; writeStudents(students); }
    }

    // Never return password in response
    res.json({
      success: true,
      token: `student_${student.id}_${Date.now()}`,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        language: student.language,
        proficiencyLevel: student.proficiencyLevel,
        teacherId: student.teacherId,
        enrollDate: student.enrollDate,
        lastActive: now,
        status: student.status
      }
    });
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;