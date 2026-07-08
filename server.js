/* ===== LURNR BACKEND SERVER ===== */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Storage configuration
const { initializeDataFiles, logStorageInfo } = require('./config/storage');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from root directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
const chatbotRoutes = require('./routes/chatbot');
const practiceRoutes = require('./routes/practice');
const sessionRoutes = require('./routes/sessions');
const teacherRoutes = require('./routes/teachers');
const studentRoutes = require('./routes/students');

app.use('/api/chat', chatbotRoutes);
app.use('/api/chat/practice', practiceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/students', studentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    llmProvider: process.env.LLM_PROVIDER
  });
});

// Fallback route for frontend client-side routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  initializeDataFiles();
  logStorageInfo();

  console.log(`🚀 Lurnr Backend running on http://localhost:${PORT}`);
  console.log(`📡 LLM Provider: ${process.env.LLM_PROVIDER}`);
  console.log(`🌍 CORS enabled for: ${process.env.CORS_ORIGIN}`);
});

module.exports = app;