# Lurnr Backend Setup Guide

## Quick Start

### Prerequisites
- Node.js 14+ installed
- npm (comes with Node.js)
- Groq API key (free) OR local Ollama installation

---

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

This installs:
- `express` — Web server
- `cors` — Cross-origin requests (for frontend)
- `dotenv` — Environment variables
- `axios` — HTTP requests to LLM API

---

## Step 2: Configure LLM Provider

### Option A: Groq API (Recommended for MVP)

1. **Get a free API key:**
   - Go to https://groq.com
   - Sign up and log in
   - Navigate to Console → API Keys
   - Copy your API key

2. **Add to `.env` file:**
   ```
   LLM_PROVIDER=groq
   GROQ_API_KEY=your_api_key_here
   PORT=5000
   ```

3. **Done!** Groq is free tier (30 requests/min), perfect for MVP.

### Option B: Local Ollama (Free, No API Key)

1. **Install Ollama:**
   - Download from https://ollama.ai
   - Install and run

2. **Pull a model:**
   ```bash
   ollama pull mistral  # Downloads ~5GB, one-time
   ```

3. **Update `.env`:**
   ```
   LLM_PROVIDER=ollama
   OLLAMA_ENDPOINT=http://localhost:11434/api/generate
   PORT=5000
   ```

4. **Run Ollama in another terminal:**
   ```bash
   ollama serve
   ```

---

## Step 3: Start Backend Server

```bash
npm start
```

You should see:
```
🚀 Lurnr Backend running on http://localhost:5000
📡 LLM Provider: groq
🌍 CORS enabled for: http://localhost:3000,http://localhost:8000,*
```

---

## Step 4: Test the Backend

### Test Health Check
```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-05-25T...",
  "llmProvider": "groq"
}
```

### Test Chat Endpoint
```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, I am a student"}'
```

Expected response:
```json
{
  "id": "conv_...",
  "role": "assistant",
  "message": "Great! Which language would you like to learn?",
  "routeNext": null,
  "timestamp": "2026-05-25T..."
}
```

---

## Step 5: Test with Frontend

1. **Start the backend** (if not already running)
2. **Open chatbot in browser:**
   - Go to `http://localhost:8000/onboarding/chatbot.html` (or your frontend URL)
   - You should see the greeting message
   - Try sending a message

3. **Check session logs:**
   ```bash
   curl http://localhost:5000/api/sessions
   ```
   Returns summary of all user sessions

---

## Development Tips

### Auto-restart on code changes
Install `nodemon` for development:
```bash
npm install --save-dev nodemon
npm run dev  # Instead of npm start
```

### View API requests
All requests are logged to console with timestamps:
```
[2026-05-25T10:30:45Z] POST /api/chat
[2026-05-25T10:30:47Z] POST /api/sessions
```

### Environment Variables Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `groq` | Which LLM to use: `groq` or `ollama` |
| `GROQ_API_KEY` | (required) | Your Groq API key |
| `OLLAMA_ENDPOINT` | `http://localhost:11434/api/generate` | Local Ollama endpoint |
| `PORT` | `5000` | Server port |
| `NODE_ENV` | `development` | Environment (`development` or `production`) |
| `CORS_ORIGIN` | `*` | Frontend URLs allowed to call this API |
| `SESSION_LOG_PATH` | `./data/sessions.json` | Where to store user sessions |

---

## Troubleshooting

### "Cannot find module 'express'"
```bash
npm install
```

### "GROQ_API_KEY not set"
- Check your `.env` file has `GROQ_API_KEY=your_key`
- Restart the server after editing `.env`

### "Ollama service not running"
- Make sure Ollama is started: `ollama serve` in another terminal
- Or switch to Groq by changing `LLM_PROVIDER=groq` in `.env`

### Frontend says "trouble connecting"
- Check backend is running: `curl http://localhost:5000/api/health`
- Check frontend's `BACKEND_API_ENDPOINT` in `assets/js/chatbot.js` matches your backend URL
- Check CORS is enabled in `.env`

### Slow responses
- Ollama is slower (~2-3 seconds) than Groq (~100-500ms)
- For production, use Groq or upgrade Ollama to a faster machine

---

## Deployment (Later Phases)

For Phase 2+, deploy to a cloud service:
- **Railway.app** (free tier with restrictions)
- **Render** (free tier with cold starts)
- **DigitalOcean** ($5/mo VPS)
- **Heroku** (paid after free tier ended)

See Phase 2 deployment guide for details.

---

## Next Steps

✅ **Backend is ready for Phase 1** — Onboarding chatbot functional

**Phase 2 (May 29 – Jul 6):** AI Conversation Engine
- [ ] Expand chatbot to handle multi-language conversations
- [ ] Add language-specific system prompts
- [ ] Implement conversation scenarios (ordering food, greetings, etc.)

**Phase 3 (Jul 7 – Aug 17):** Voice & Video
- [ ] Integrate speech-to-text (Web Speech API or AssemblyAI)
- [ ] Add pronunciation feedback
- [ ] Handle video lesson playback


---

## Gikuyu language support

The landing-page chatbot adds Gikuyu reference material to its prompt when a user asks about Gikuyu/Kikuyu:
verse pairs retrieved from a parallel Gikuyu/English Bible (`data/gikuyu/bible_parallel.jsonl`, searched with
MiniSearch in `lib/gikuyuRetrieval.js`) plus any native-speaker entries in `data/gikuyu/phrasebook.json`
(entries with an empty `kik` field are ignored).

- Rebuild the dataset: `node scripts/buildGikuyuParallel.js <kikuyu-usfm-dir> <web-usfm-dir>`
  (sources: `https://ebible.org/Scriptures/kik_usfm.zip` and `https://ebible.org/Scriptures/engwebp_usfm.zip`).
- Try it: start the server, then `node scripts/testGikuyu.js`.

### Attribution

Gikuyu text: Biblica Open Kikuyu Holy Word of God, CC BY-SA 4.0. Original work available for free at www.biblica.com and open.bible

English text: World English Bible (public domain).
