/* ===== LURNR PRACTICE CHATBOT ROUTE ===== */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    travel: `The student is practicing travel and directions vocabulary. Guide them through: asking where places are, buying tickets, asking how far, navigating transport. Use realistic travel scenario dialogue.`,
    hotel: `The student is practicing hotel or hospitality interactions. Use a warm, respectful, slightly formal service register. Open with a welcome, clarify dates/identity/room type/payment or the issue, offer options, confirm the choice, and close with practical next steps. Avoid slang, sarcasm, or long personal stories.`,
    hospital: `The student is practicing a specialist consultation. Use a high-trust, high-clarity, empathy-first register. Allow the patient to ask questions about symptoms, timing, severity, prior treatment, fears, alternatives, side effects, and next steps. Explain options, benefits, risks, and consequences clearly, and check understanding.`,
    clinic: `The student is practicing front-desk or pharmacy counter interactions. Use short, clear, privacy-aware institutional language focused on appointments, forms, referrals, directions, prescriptions, timing, payment, and identity confirmation. Repeat critical details and keep instructions plain.`,
    shopping: `The student is practicing polite customer-seller conversations. Follow a path of greeting, need discovery, product questions, comparing options, price or quantity confirmation, bargaining, payment, and closing thanks. Use questions to clarify the buyer's needs.`,
    restaurant: `The student is practicing dining interactions. Use hospitable but efficient language: greeting, seating or order-taking, preference questions, recommendations, order confirmation, check-back, payment, and closing remarks. Reward precise allergy or substitution clarification.`,
    office: `The student is practicing a formal workplace update. Use a status-aware, evidence-driven register. Structure contributions around progress, facts, blockers, risks, and suggested next actions. Respect hierarchy while giving clear proposals and avoiding gossip.`,
    colleagues: `The student is practicing a semi-formal colleague conversation. Use collaborative language, focus on shared problem-solving, clear proposals, and concise disagreement with reasons. Allow a little friendly opening talk if it helps the group settle, but keep the focus on decisions and next steps.`,
    peer: `The student is practicing friendly informal talk. Allow slang, overlap, joking, storytelling, expressive reactions, and flexible topic drift. Use casual, warm language and encourage playful banter while keeping the conversation positive.`,
    religious: `The student is practicing respectful religious or community conversation. Use sincere, supportive, community-sensitive language. Prioritize listening, shared values, and appropriate acknowledgement of ritual or belief traditions. Use mild humor only if it feels respectful.`,
    publicservice: `The student is practicing a public service or government office interaction. Use neutral to formal rule-governed language. Reward accuracy, procedural clarity, respectful distance, and careful confirmation of eligibility, deadlines, or required steps. Keep the tone fair and consistent.`,
    buergeramt: `The student is practicing a Bürgeramt-style civil service interaction in German. Use a formal, procedural, low-emotion exchange. Emphasize appointments, document preparation, and clear identification of the needed service. Use "Sie" for first meetings and keep questions narrow and administrative.`,
    verein: `The student is practicing a Verein or club onboarding conversation in German. Be friendly, organized, and moderately personal. Start with a short introduction, then move quickly into membership, schedules, responsibilities, training times, fees, and expectations. Encourage the student to ask how the group works.`,
    stammtisch: `The student is practicing a Stammtisch-style gathering in German. Keep it informal, opinionated, and direct. Let people debate practical topics, distinguish disagreement from personal hostility, and keep the conversation grounded in points rather than emotion.`,
    baraza: `The student is practicing a Swahili baraza setting. Use unhurried, socially observant language. Begin with greetings, well-being checks, and acknowledgement of who is present. Only then move to the substantive topic, with a communal pacing rather than a straight transaction.`,
    elders: `The student is practicing a Swahili elder-greeting conversation. Use explicit respect rituals such as "Shikamoo" and reply patterns like "Marahaba." Start with respect, then continue with warm, humble well-being and family questions. Avoid impatience.`,
    wedding: `The student is practicing a Swahili wedding or marriage conversation. Use family-centered, ceremonially respectful, modest language. Mention blessings, family honor, beauty, good fortune, and social harmony. Keep joy restrained and avoid flirtation or inappropriate humor.`,
    kiama: `The student is practicing a Kikuyu kiama dispute or mediation. Use formal, fact-presenting, reconciliation-oriented language. Present the issue clearly, cite history or witnesses, and leave room for elder questioning. Respect elders and avoid insults or modern courtroom tone.`,
    njohi: `The student is practicing a Kikuyu njohi ya njurio hand-asking visit. Use inter-family, representative, ceremonially indirect language. Let elders or spokespeople lead. Start with courtesy and intention before practical terms, and keep the tone respectful and relationship-focused.`,
    ruracio: `The student is practicing a Kikuyu ruracio or marriage-sealing conversation. Use high-formality, elder-governed, ceremonial language. Move in stages: greetings and acknowledgements, intention and consent, negotiated items, clarification, and ceremonial acceptance. Keep humor controlled and precise.`,
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
 * POST /api/chat/practice/transcribe
 * Body: form-data with audio file and optional language
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const language = req.body.language || 'German';
    const audioBuffer = req.file.buffer;

    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'pronunciation.webm',
      contentType: req.file.mimetype || 'audio/webm'
    });
    formData.append('model', 'whisper-large-v3-turbo');

    const languageCodes = { German: 'de', Swahili: 'sw', Kikuyu: '' };
    const langCode = languageCodes[language] || '';
    if (langCode) {
    formData.append('language', langCode);
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({ error: 'GROQ_API_KEY not set' });
    }

    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${groqApiKey}`
      },
      timeout: 20000
    });

    return res.json({ transcript: response.data.text || '' });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: 'Transcription failed', details: error.message });
  }
});

/**
 * POST /api/chat/practice/evaluate
 * Body: { expectedPhrase, transcript, language }
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { expectedPhrase, transcript, language } = req.body;
    if (!expectedPhrase || !transcript) {
      return res.status(400).json({ error: 'expectedPhrase and transcript are required' });
    }

    const systemPrompt = `You are a pronunciation coach. The user is practicing spoken ${language || 'German'}.
Given the expected phrase and the transcript from speech recognition, provide:
1. A short evaluation of how close the spoken phrase was to the expected phrase.
2. A clear result of whether the pronunciation was correct, mostly correct, or needs improvement.
3. A brief score or suggestion.
4. One concrete tip to improve pronunciation.
Do not rewrite the transcript. Keep the response friendly and encouraging.`;

    const history = [
      { role: 'user', content: `Expected phrase: "${expectedPhrase}"` },
      { role: 'user', content: `Transcript: "${transcript}"` },
      { role: 'user', content: 'Evaluate this pronunciation and give a single concise feedback message, and also answer with CORRECT, PARTIALLY CORRECT, or IMPROVE in JSON format.' }
    ];

    const feedback = await callGroqAPI(history, systemPrompt);
    const parsed = parsePronunciationFeedback(feedback);

    res.json(parsed);
  } catch (error) {
    console.error('Pronunciation evaluation error:', error);
    res.status(500).json({
      error: 'Pronunciation evaluation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Call Groq API — same pattern as onboarding chatbot
 */
function parsePronunciationFeedback(raw) {
  const normalized = (raw || '').trim();
  const result = { message: normalized, correct: false, score: null };

  // Prefer explicit numeric scores included in the LLM output (e.g. "Score: 85")
  const pct = /([0-9]{1,3})\s?%/.exec(normalized) || /Score[:\s]+([0-9]{1,3})/.exec(normalized);
  if (pct && pct[1]) {
    const n = Math.max(0, Math.min(100, parseInt(pct[1], 10)));
    result.score = n;
    result.correct = n >= 85;
    return result;
  }

  // Fallback keyword-based scoring
  if (/\bCORRECT\b/i.test(normalized) || /\bperfect\b/i.test(normalized) || /\bexcellent\b/i.test(normalized)) {
    result.correct = true;
    result.score = 95;
  } else if (/\bPARTIALLY CORRECT\b/i.test(normalized) || /\bmostly correct\b/i.test(normalized) || /\balmost\b/i.test(normalized)) {
    result.correct = false;
    result.score = 70;
  } else if (/\bIMPROVE\b/i.test(normalized) || /\bneeds improvement\b/i.test(normalized) || /\btry again\b/i.test(normalized)) {
    result.correct = false;
    result.score = 40;
  } else {
    // Unknown phrasing — give a neutral mid score
    result.correct = false;
    result.score = 60;
  }

  return result;
}

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