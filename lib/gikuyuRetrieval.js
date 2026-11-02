/* ===== GIKUYU EXAMPLE RETRIEVAL =====
 * Keyword search over the Gikuyu/English parallel Bible (data/gikuyu/bible_parallel.jsonl)
 * and the native-speaker phrasebook (data/gikuyu/phrasebook.json).
 */
const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');

const DATA_DIR = path.join(__dirname, '..', 'data', 'gikuyu');
const PARALLEL_FILE = path.join(DATA_DIR, 'bible_parallel.jsonl');
const PHRASEBOOK_FILE = path.join(DATA_DIR, 'phrasebook.json');

const MAX_WORDS = 30;
const CANDIDATES = 60;

const STOPWORDS = new Set((
  'a an and are as at be by can do does for from how i in is it me my of on or say so that the this to ' +
  'was we what when where which who why will with you your please tell about word words mean means ' +
  'gikuyu kikuyu gĩkũyũ translate translation learn teach'
).split(' '));

let verses = [];
let index = null;
let phrasebook = [];

const wordCount = text => text.trim().split(/\s+/).length;

function load() {
  try {
    verses = fs.readFileSync(PARALLEL_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line, id) => ({ id, ...JSON.parse(line) }));
    index = new MiniSearch({
      fields: ['en', 'kik'],
      storeFields: ['ref', 'kik', 'en'],
      searchOptions: { prefix: true, boost: { en: 2 } },
    });
    index.addAll(verses);
    console.log(`📖 Gikuyu retrieval: indexed ${verses.length} verse pairs`);
  } catch (error) {
    verses = [];
    index = null;
    console.warn(`⚠️  Gikuyu retrieval disabled (could not load ${PARALLEL_FILE}): ${error.message}`);
  }

  try {
    const entries = JSON.parse(fs.readFileSync(PHRASEBOOK_FILE, 'utf8'));
    phrasebook = entries.filter(e => e && e.kik && e.kik.trim() && e.en && e.en.trim());
    console.log(`📒 Gikuyu phrasebook: ${phrasebook.length} entries`);
  } catch (error) {
    phrasebook = [];
    console.warn(`⚠️  Gikuyu phrasebook not loaded: ${error.message}`);
  }
}

/**
 * Top k short verse pairs matching the query: [{ ref, kik, en }]
 */
function getGikuyuExamples(query, k = 6) {
  if (!index || typeof query !== 'string') return [];

  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{M}'’]+/u)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
  if (terms.length === 0) return [];

  return index
    .search(terms.join(' '), { combineWith: 'OR' })
    .slice(0, CANDIDATES)
    .filter(r => wordCount(r.kik) < MAX_WORDS && wordCount(r.en) < MAX_WORDS)
    .slice(0, k)
    .map(({ ref, kik, en }) => ({ ref, kik, en }));
}

/** Native-speaker phrasebook entries that have been filled in. */
function getPhrasebook() {
  return phrasebook;
}

load();

module.exports = { getGikuyuExamples, getPhrasebook };
