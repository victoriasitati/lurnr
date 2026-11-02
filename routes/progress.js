/* ===== LESSON PROGRESS ROUTES ===== */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { USE_DATABASE, db, STUDENTS_PATH, PROGRESS_PATH } = require('../config/storage');

const LESSON_TYPES = ['scenario', 'material'];
const ID_PATTERN = /^[\w-]{1,100}$/;
const LEARNING_PATH_FILE = path.join(__dirname, '..', 'data', 'learning-path.json');

function loadLearningPath() {
  try {
    return JSON.parse(fs.readFileSync(LEARNING_PATH_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading learning path:', err);
    return {};
  }
}

// ─────────────────────────────────────────────
//  STORAGE (file mode, or MySQL when USE_DATABASE=true)
// ─────────────────────────────────────────────

function readProgressFile() {
  try {
    return fs.existsSync(PROGRESS_PATH) ? JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8')) : [];
  } catch (err) {
    console.error('Error reading progress file:', err);
    return [];
  }
}

function writeProgressFile(records) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(records, null, 2));
}

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = db.execute(`
      CREATE TABLE IF NOT EXISTS lesson_progress (
        studentId VARCHAR(50) NOT NULL,
        lessonType VARCHAR(20) NOT NULL,
        lessonId VARCHAR(100) NOT NULL,
        score INT NULL,
        attempts INT NOT NULL DEFAULT 1,
        completedAt DATETIME NOT NULL,
        lastCompletedAt DATETIME NOT NULL,
        PRIMARY KEY (studentId, lessonType, lessonId)
      )
    `).catch(err => { tableReady = null; throw err; });
  }
  return tableReady;
}

async function studentExists(studentId) {
  if (USE_DATABASE) {
    const [rows] = await db.execute('SELECT id FROM students WHERE id = ? LIMIT 1', [studentId]);
    return rows.length > 0;
  }
  try {
    return JSON.parse(fs.readFileSync(STUDENTS_PATH, 'utf-8')).some(s => s.id === studentId);
  } catch (err) {
    return false;
  }
}

async function getCompleted(studentId) {
  if (USE_DATABASE) {
    await ensureTable();
    const [rows] = await db.execute(
      'SELECT lessonType, lessonId, score, attempts, completedAt, lastCompletedAt FROM lesson_progress WHERE studentId = ? ORDER BY completedAt',
      [studentId]
    );
    return rows.map(r => ({
      type: r.lessonType,
      lessonId: r.lessonId,
      score: r.score,
      attempts: r.attempts,
      completedAt: new Date(r.completedAt).toISOString(),
      lastCompletedAt: new Date(r.lastCompletedAt).toISOString()
    }));
  }
  return readProgressFile()
    .filter(r => r.studentId === studentId)
    .map(({ studentId: _omit, ...rest }) => rest);
}

async function saveCompletion(studentId, type, lessonId, score) {
  const now = new Date();
  if (USE_DATABASE) {
    await ensureTable();
    await db.execute(
      `INSERT INTO lesson_progress (studentId, lessonType, lessonId, score, attempts, completedAt, lastCompletedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         score = CASE WHEN VALUES(score) IS NULL THEN score WHEN score IS NULL THEN VALUES(score) ELSE GREATEST(score, VALUES(score)) END,
         attempts = attempts + 1,
         lastCompletedAt = VALUES(lastCompletedAt)`,
      [studentId, type, lessonId, score, now, now]
    );
    return;
  }
  const records = readProgressFile();
  const existing = records.find(r => r.studentId === studentId && r.type === type && r.lessonId === lessonId);
  if (existing) {
    existing.attempts = (existing.attempts || 1) + 1;
    existing.lastCompletedAt = now.toISOString();
    if (score !== null && (existing.score === null || existing.score === undefined || score > existing.score)) existing.score = score;
  } else {
    records.push({
      studentId, type, lessonId, score,
      attempts: 1,
      completedAt: now.toISOString(),
      lastCompletedAt: now.toISOString()
    });
  }
  writeProgressFile(records);
}

async function removeCompletion(studentId, type, lessonId) {
  if (USE_DATABASE) {
    await ensureTable();
    await db.execute(
      'DELETE FROM lesson_progress WHERE studentId = ? AND lessonType = ? AND lessonId = ?',
      [studentId, type, lessonId]
    );
    return;
  }
  writeProgressFile(readProgressFile().filter(
    r => !(r.studentId === studentId && r.type === type && r.lessonId === lessonId)
  ));
}

// ─────────────────────────────────────────────
//  RESPONSE: completed lessons + what to do next
// ─────────────────────────────────────────────

async function buildProgress(studentId, language) {
  const completed = await getCompleted(studentId);
  const lessons = loadLearningPath()[language] || [];
  const doneScenarios = new Set(completed.filter(c => c.type === 'scenario').map(c => c.lessonId));
  const remaining = lessons.filter(key => !doneScenarios.has(key));
  const done = lessons.length - remaining.length;

  return {
    studentId,
    language: language || null,
    completed,
    path: lessons,
    summary: { done, total: lessons.length },
    nextScenario: remaining[0] || null,
    pathComplete: lessons.length > 0 && remaining.length === 0
  };
}

function validateLesson(type, lessonId) {
  if (!LESSON_TYPES.includes(type)) return `type must be one of: ${LESSON_TYPES.join(', ')}`;
  if (typeof lessonId !== 'string' || !ID_PATTERN.test(lessonId)) return 'lessonId is invalid';
  return null;
}

// ─────────────────────────────────────────────
//  GET /api/progress/:studentId?language=Swahili
// ─────────────────────────────────────────────
router.get('/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!(await studentExists(studentId))) return res.status(404).json({ error: 'Student not found' });
    res.json(await buildProgress(studentId, req.query.language));
  } catch (err) {
    console.error('Progress fetch error:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

// ─────────────────────────────────────────────
//  POST /api/progress/:studentId/complete
//  Body: { type: 'scenario'|'material', lessonId, score (optional 0-100), language (optional) }
// ─────────────────────────────────────────────
router.post('/:studentId/complete', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { type, lessonId, language } = req.body;

    const invalid = validateLesson(type, lessonId);
    if (invalid) return res.status(400).json({ error: invalid });

    let score = null;
    if (req.body.score !== undefined && req.body.score !== null) {
      score = Math.round(Number(req.body.score));
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        return res.status(400).json({ error: 'score must be a number from 0 to 100' });
      }
    }

    if (!(await studentExists(studentId))) return res.status(404).json({ error: 'Student not found' });

    await saveCompletion(studentId, type, lessonId, score);
    res.json({ success: true, ...(await buildProgress(studentId, language)) });
  } catch (err) {
    console.error('Progress save error:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// ─────────────────────────────────────────────
//  DELETE /api/progress/:studentId/:type/:lessonId?language=Swahili
//  Un-mark a lesson (e.g. a material marked done by mistake)
// ─────────────────────────────────────────────
router.delete('/:studentId/:type/:lessonId', async (req, res) => {
  try {
    const { studentId, type, lessonId } = req.params;
    const invalid = validateLesson(type, lessonId);
    if (invalid) return res.status(400).json({ error: invalid });
    if (!(await studentExists(studentId))) return res.status(404).json({ error: 'Student not found' });

    await removeCompletion(studentId, type, lessonId);
    res.json({ success: true, ...(await buildProgress(studentId, req.query.language)) });
  } catch (err) {
    console.error('Progress delete error:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

module.exports = router;
