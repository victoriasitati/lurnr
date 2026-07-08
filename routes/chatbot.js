/* ===== LURNR CHATBOT ROUTES ===== */
const express = require('express');
const router = express.Router();
const axios = require('axios');

// Conversation history storage (in-memory for MVP, upgrade to DB in Phase 2)
const conversationHistories = new Map();

// System prompt for onboarding chatbot
const SYSTEM_PROMPT = `You are Lurnr's friendly onboarding assistant. Lurnr is an African EdTech platform teaching Swahili, German and Kikuyu through AI conversation practice, pronunciation feedback, and video lessons.

Your job is to:
1. Warmly greet the user if it's their first message
2. In the first 1-2 turns, identify if they are a STUDENT or TEACHER
3. For STUDENTS: Ask which language they want to learn (Swahili, Kikuyu, or German), their level (beginner/intermediate/advanced), and their main goal
4. For TEACHERS: Explain the teacher dashboard features (uploading videos, managing students, tracking progress)
5. Answer questions about Lurnr clearly and enthusiastically
6. Keep responses concise (2-4 sentences max) and warm
7. Use relevant emojis occasionally to keep tone friendly
8. If unsure about a feature, say "That's coming soon!" cheerfully

IMPORTANT ROUTING INSTRUCTIONS:
- Once you've identified a STUDENT and collected their language + level + goal, end with: "[ROUTE: student-dashboard]"
- Once you've identified a TEACHER, end with: "[ROUTE: teacher-login]"
- These routing tags help the frontend know where to send the user next

Speak in English unless the user writes in another language. Keep it conversational and encouraging.`;

/**
 * POST /api/chat
 * Body: { userId (optional), message, conversationId (optional) }
 * Response: { id, role, message, routeNext (optional) }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, message, conversationId } = req.body;

    // Validate request
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid request: message is required' });
    }

    // Generate or use existing conversation ID
    const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize conversation history if needed
    if (!conversationHistories.has(convId)) {
      conversationHistories.set(convId, []);
    }

    const history = conversationHistories.get(convId);

    // Add user message to history
    history.push({ role: 'user', content: message });

    // Call LLM provider
    let botResponse;
    const llmProvider = process.env.LLM_PROVIDER || 'groq';

    if (llmProvider === 'groq') {
      botResponse = await callGroqAPI(history);
    } else if (llmProvider === 'ollama') {
      botResponse = await callOllamaAPI(history);
    } else {
      throw new Error(`Unknown LLM provider: ${llmProvider}`);
    }

    // Add bot response to history
    history.push({ role: 'assistant', content: botResponse });

    // Check for routing tags in response
    let routeNext = null;
    if (botResponse.includes('[ROUTE: student-dashboard]')) {
      routeNext = 'student-dashboard';
      // Clean up the response to remove routing tag
      botResponse = botResponse.replace('[ROUTE: student-dashboard]', '').trim();
    } else if (botResponse.includes('[ROUTE: teacher-login]')) {
      routeNext = 'teacher-login';
      botResponse = botResponse.replace('[ROUTE: teacher-login]', '').trim();
    }

    // Keep conversation history manageable (last 20 messages)
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Return response
    res.json({
      id: convId,
      role: 'assistant',
      message: botResponse,
      routeNext: routeNext,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Call Groq API for LLM response
 */
async function callGroqAPI(history) {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not set in environment variables');
  }

  const messages = history.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile', // Currently supported model
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 300,
        top_p: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Groq API authentication failed. Check GROQ_API_KEY.');
    } else if (error.response?.status === 400) {
      const errorMsg = error.response?.data?.error?.message || 'Bad request to Groq API';
      throw new Error(`Groq API error: ${errorMsg}`);
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Groq API timeout. Try again in a moment.');
    }
    throw error;
  }
}

/**
 * Call local Ollama API for LLM response (fallback)
 */
async function callOllamaAPI(history) {
  const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
  
  // Format message history for Ollama
  let prompt = SYSTEM_PROMPT + '\n\n';
  
  history.forEach(msg => {
    if (msg.role === 'user') {
      prompt += `User: ${msg.content}\n`;
    } else {
      prompt += `Assistant: ${msg.content}\n`;
    }
  });
  
  prompt += 'Assistant: ';

  try {
    const response = await axios.post(
      ollamaEndpoint,
      {
        model: 'mistral', // Default model, change if different
        prompt: prompt,
        stream: false
      },
      { timeout: 30000 }
    );

    return response.data.response || 'I could not generate a response. Please try again.';
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Ollama service not running. Start Ollama or use Groq API.');
    }
    throw error;
  }
}

module.exports = router;
