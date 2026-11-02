/* ===== LURNR CHATBOT ROUTES ===== */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getGikuyuExamples, getPhrasebook } = require('../lib/gikuyuRetrieval');

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

const GIKUYU_INSTRUCTIONS = `

GIKUYU LANGUAGE GUIDANCE:
The user is asking about Gikuyu (Kikuyu). The reference material below is there to help you get vocabulary, spelling and diacritics right.
- Use the examples as a reference for vocabulary, spelling and diacritics.
- Prefer modern, everyday Gikuyu over biblical phrasing.
- Always write ĩ and ũ correctly (e.g. Gĩkũyũ, mũndũ, nĩ).
- Do not quote Bible verses to the user unless they ask for them.
- Answer the user's Gikuyu question directly and first. Do not open with a greeting or a welcome to Lurnr, and do not ask whether they are a student or a teacher in the same reply. This overrides the onboarding steps above for this reply. You can mention Lurnr's lessons briefly at the end if it fits naturally, or offer to help with another word or phrase.
- Only give Gikuyu words or phrases you are confident about, i.e. ones in the phrasebook, in the examples, or that you know well. Never invent or guess a Gikuyu word, phrase, greeting or number.
- If you are not sure, say so plainly (for example "I'm not certain of that one, so please check with a Gikuyu teacher") and offer what you do know, such as the Swahili or English equivalent or a related word from the examples.
- Do not make up Gikuyu pronunciation guides or translations to fill a gap. A shorter, honest answer is better than a confident wrong one.`;

/** True if this message, or a recent user message, is about Gikuyu/Kikuyu. */
function isGikuyuConversation(history) {
  return history
    .filter(msg => msg.role === 'user')
    .slice(-3)
    .some(msg => /\b(a?gikuyu|a?kikuyu)\b/.test(
      msg.content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    ));
}

/** System prompt, with Gikuyu reference material added when the user is asking about Gikuyu. */
function buildSystemPrompt(history) {
  if (!isGikuyuConversation(history)) return SYSTEM_PROMPT;

  let prompt = SYSTEM_PROMPT + GIKUYU_INSTRUCTIONS;

  const phrasebook = getPhrasebook();
  if (phrasebook.length > 0) {
    prompt += '\n\nGIKUYU PHRASEBOOK (written by native speakers; treat as correct):\n' +
      phrasebook.map(e => `- ${e.en} = ${e.kik}${e.category ? ` (${e.category})` : ''}${e.notes ? ` [${e.notes}]` : ''}`).join('\n');
  }

  const lastUserMessage = history.filter(msg => msg.role === 'user').slice(-1)[0].content;
  const examples = getGikuyuExamples(lastUserMessage, 6);
  console.log(`[gikuyu] retrieved refs: ${examples.map(e => e.ref).join(', ') || 'none'}`);
  if (examples.length > 0) {
    prompt += '\n\nGIKUYU REFERENCE EXAMPLES (English / Gikuyu pairs, for vocabulary, spelling and diacritics only):\n' +
      examples.map(e => `English: ${e.en}\nGikuyu: ${e.kik}`).join('\n\n');
  }

  return prompt;
}

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
    const systemPrompt = buildSystemPrompt(history);
    let botResponse;
    const llmProvider = process.env.LLM_PROVIDER || 'groq';

    if (llmProvider === 'groq') {
      botResponse = await callGroqAPI(history, systemPrompt);
    } else if (llmProvider === 'ollama') {
      botResponse = await callOllamaAPI(history, systemPrompt);
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
async function callGroqAPI(history, systemPrompt = SYSTEM_PROMPT) {
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
        model: 'openai/gpt-oss-120b', // Currently supported model
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000,
        reasoning_effort: 'low',
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
async function callOllamaAPI(history, systemPrompt = SYSTEM_PROMPT) {
  const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
  
  // Format message history for Ollama
  let prompt = systemPrompt + '\n\n';
  
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
