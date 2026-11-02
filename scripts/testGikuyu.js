#!/usr/bin/env node
/**
 * Sends sample Gikuyu questions to the local chatbot so a native speaker can review the replies.
 * Start the backend first (npm start), then: node scripts/testGikuyu.js [baseUrl]
 * The server logs "[gikuyu] retrieved refs: ..." for each question.
 */
const axios = require('axios');

const BASE_URL = process.argv[2] || process.env.CHAT_URL || 'http://localhost:5000';
const DELAY_MS = 4000;       // pause between questions to stay under Groq's rate limit
const RETRY_DELAY_MS = 15000; // wait before retrying once after a rate-limit (429) or other server error
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ask(question) {
  const url = `${BASE_URL}/api/chat`;
  try {
    return (await axios.post(url, { message: question }, { timeout: 30000 })).data;
  } catch (error) {
    if (error.response?.status !== 500) throw error;
    console.log(`    (server error, retrying in ${RETRY_DELAY_MS / 1000}s...)`);
    await sleep(RETRY_DELAY_MS);
    return (await axios.post(url, { message: question }, { timeout: 30000 })).data;
  }
}

const QUESTIONS = [
  // greetings
  'How do I say hello in Gikuyu?',
  'How do I greet an elder in Kikuyu?',
  'How do I say thank you in Gĩkũyũ?',
  // family words
  'What is the Gikuyu word for mother and father?',
  'How do I say brother and sister in Kikuyu?',
  'What do Gikuyu people call their grandmother?',
  // numbers
  'Teach me to count from one to five in Gikuyu.',
  'How do I say ten in Kikuyu?',
  // simple sentences
  'How do I say "My name is Anna" in Gikuyu?',
  'How do I say "I want to learn Gikuyu" in Gikuyu?',
];

async function main() {
  console.log(`Testing ${BASE_URL}/api/chat with ${QUESTIONS.length} questions\n`);
  for (const [i, question] of QUESTIONS.entries()) {
    console.log(`#${i + 1}  Q: ${question}`);
    try {
      const data = await ask(question);
      console.log(`    A: ${data.message}\n`);
    } catch (error) {
      const detail = error.response?.data?.error || error.message;
      console.log(`    ERROR: ${detail}\n`);
    }
    if (i < QUESTIONS.length - 1) await sleep(DELAY_MS);
  }
}

main();
