/* ===== SESSION TRACKING ROUTES ===== */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SESSION_LOG_PATH = process.env.SESSION_LOG_PATH || './data/sessions.json';

/**
 * POST /api/sessions
 * Log a new session (user visit to chatbot)
 * Body: { userType, language, proficiencyLevel, goal, conversationId }
 */
router.post('/', (req, res) => {
  try {
    const { userType, language, proficiencyLevel, goal, conversationId } = req.body;

    // Create session record
    const session = {
      id: `session_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userType: userType || 'unknown', // student, teacher, unknown
      language: language || null,
      proficiencyLevel: proficiencyLevel || null,
      goal: goal || null,
      conversationId: conversationId || null,
      userAgent: req.headers['user-agent']
    };

    // Read existing sessions
    let sessions = [];
    if (fs.existsSync(SESSION_LOG_PATH)) {
      try {
        const data = fs.readFileSync(SESSION_LOG_PATH, 'utf8');
        sessions = JSON.parse(data);
      } catch (e) {
        console.error('Error reading sessions file:', e);
      }
    }

    // Append new session
    sessions.push(session);

    // Write back to file
    fs.writeFileSync(SESSION_LOG_PATH, JSON.stringify(sessions, null, 2));

    res.json({ 
      success: true, 
      sessionId: session.id,
      message: 'Session logged successfully'
    });

  } catch (error) {
    console.error('Session logging error:', error);
    res.status(500).json({ 
      error: 'Failed to log session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/sessions
 * Retrieve all sessions (admin/debug endpoint)
 */
router.get('/', (req, res) => {
  try {
    let sessions = [];
    if (fs.existsSync(SESSION_LOG_PATH)) {
      const data = fs.readFileSync(SESSION_LOG_PATH, 'utf8');
      sessions = JSON.parse(data);
    }

    // Return summary
    const summary = {
      totalSessions: sessions.length,
      students: sessions.filter(s => s.userType === 'student').length,
      teachers: sessions.filter(s => s.userType === 'teacher').length,
      unknown: sessions.filter(s => s.userType === 'unknown').length,
      recentSessions: sessions.slice(-10)
    };

    res.json(summary);
  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
});

module.exports = router;
