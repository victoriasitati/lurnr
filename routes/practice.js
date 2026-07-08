/* ===== LURNR PRACTICE CHATBOT ROUTE ===== */
const express = require('express');
const router = express.Router();
const axios = require('axios');

// Separate conversation histories for practice sessions
const practiceHistories = new Map();

/**
 * Build a dynamic system prompt based on the student's profile
 */
function buildPracticePrompt(language, level, scenario) {
  const languageInstructions = {
    German: {
      name: 'German',
      nativeName: 'Deutsch',
      greeting: 'Hallo',
      encouragement: ['Sehr gut!', 'Wunderbar!', 'Ausgezeichnet!', 'Weiter so!', 'Fast perfekt!']
    },
    Swahili: {
      name: 'Swahili',
      nativeName: 'Kiswahili',
      greeting: 'Habari',
      encouragement: ['Vizuri sana!', 'Hongera!', 'Umefanya vizuri!', 'Endelea hivyo!', 'Karibu sana!']
    },
    Kikuyu: {
      name: 'Kikuyu',
      nativeName: 'Gĩkũyũ',
      greeting: 'Wîmwega',
      encouragement: ['Nîwega mũno!', 'Gĩa mwega!', 'Ũndũ mwega!', 'Endelea!', 'Nîwîra mwega!']
    }
  };

  const scenarioContexts = {
    greetings: `The student is practicing greetings and introductions. Guide them through: saying hello, asking how someone is, introducing their name, and saying goodbye. Use progressively natural conversational exchanges.`,
    food: `The student is practicing food and restaurant vocabulary. Guide them through: ordering a meal, asking what something is, commenting on taste, asking for the bill. Use realistic restaurant scenario dialogue.`,
    travel: `The student is practicing travel and directions vocabulary. Guide them through: asking where places are, buying tickets, asking how far, navigating transport. Use realistic travel scenario dialogue.`
  };

  const lang = languageInstructions[language] || languageInstructions.German;
  const scenarioContext = scenarioContexts[scenario] || scenarioContexts.greetings;

  return `You are Lurnr's AI language practice tutor. You are helping a ${level || 'beginner'} student learn ${lang.name} (${lang.nativeName}) through real conversation practice.

STUDENT PROFILE:
- Language learning: ${lang.name}
- Level: ${level || 'Beginner'}
- Current scenario: ${scenario || 'greetings'}

YOUR ROLE:
${scenarioContext}

HOW TO RESPOND:
1. Always respond primarily in ${lang.name} — this is a language immersion practice session
2. After your ${lang.name} response, add a brief English translation in italics or parentheses so the student understands
3. Keep responses short (1-3 sentences) so the conversation flows naturally like a real chat
4. Gently correct mistakes without breaking the flow — acknowledge what they said, give the correction naturally, then continue
5. Use encouragement words like: ${lang.encouragement.join(', ')}
6. Vary your vocabulary and sentence structures so every session feels fresh
7. Gradually introduce new words relevant to the scenario as the conversation progresses
8. If the student writes in English, respond partly in English but guide them to try in ${lang.name}
9. If they type /hint, give them a helpful phrase they can use next in ${lang.name} with translation
10. Never make the student feel bad for mistakes — language learning takes time!

CORRECTION STYLE:
- Wrong: "That's incorrect, you should say X"
- Right: "Nice try! We'd say '${lang.greeting}...' — [continue conversation naturally]"

CONTENT VARIETY:
- Mix vocabulary: common words, useful phrases, cultural context
- Vary sentence complexity based on the student's level
- Introduce idioms and cultural phrases naturally for intermediate/advanced students
- For beginners, stick to simple, high-frequency vocabulary

IMPORTANT: Keep responses conversational, warm, and encouraging. This should feel like chatting with a patient native speaker friend, not a formal lesson. The goal is confidence through practice.`;
}

/**
 * POST /api/chat/practice
 * Body: { userId, message, conversationId, context }
 * context format: "language=German&level=Beginner&scenario=greetings"
 */
router.post('/', async (req, res) => {
  try {
    const { userId, message, conversationId, context } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Parse context string into language/level/scenario
    const params = new URLSearchParams(context || '');
    const language = params.get('language') || 'German';
    const level = params.get('level') || 'Beginner';
    const scenario = params.get('scenario') || 'greetings';

    // Generate or reuse conversation ID
    const convId = conversationId || `practice_${userId || 'anon'}_${Date.now()}`;

    // Initialize history if needed
    if (!practiceHistories.has(convId)) {
      practiceHistories.set(convId, []);
    }

    const history = practiceHistories.get(convId);
    history.push({ role: 'user', content: message });

    // Build dynamic system prompt for this student
    const systemPrompt = buildPracticePrompt(language, level, scenario);

    // Call LLM
    let botResponse;
    const llmProvider = process.env.LLM_PROVIDER || 'groq';

    if (llmProvider === 'groq') {
      botResponse = await callGroqAPI(history, systemPrompt);
    } else if (llmProvider === 'ollama') {
      botResponse = await callOllamaAPI(history, systemPrompt);
    } else {
      throw new Error(`Unknown LLM provider: ${llmProvider}`);
    }

    history.push({ role: 'assistant', content: botResponse });

    // Keep history manageable
    if (history.length > 30) {
      history.splice(0, history.length - 30);
    }

    res.json({
      id: convId,
      role: 'assistant',
      message: botResponse,
      language,
      level,
      scenario,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Practice chatbot error:', error);
    res.status(500).json({
      error: 'Failed to process practice message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Call Groq API — same pattern as onboarding chatbot
 */
async function callGroqAPI(history, systemPrompt) {
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) throw new Error('GROQ_API_KEY not set');

  const messages = history.map(msg => ({ role: msg.role, content: msg.content }));

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.85, // Slightly higher than onboarding for more varied responses
        max_tokens: 200,   // Shorter — practice chat should be snappy
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
    if (error.response?.status === 401) throw new Error('Groq API authentication failed.');
    if (error.response?.status === 400) throw new Error(`Groq API error: ${error.response?.data?.error?.message}`);
    if (error.code === 'ECONNABORTED') throw new Error('Groq API timeout. Try again.');
    throw error;
  }
}

/**
 * Call Ollama API — same pattern as onboarding chatbot
 */
async function callOllamaAPI(history, systemPrompt) {
  const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';

  let prompt = systemPrompt + '\n\n';
  history.forEach(msg => {
    prompt += msg.role === 'user' ? `User: ${msg.content}\n` : `Assistant: ${msg.content}\n`;
  });
  prompt += 'Assistant: ';

  try {
    const response = await axios.post(
      ollamaEndpoint,
      { model: 'mistral', prompt, stream: false },
      { timeout: 30000 }
    );
    return response.data.response || 'I could not generate a response. Please try again.';
  } catch (error) {
    if (error.code === 'ECONNREFUSED') throw new Error('Ollama service not running.');
    throw error;
  }
}

module.exports = router;