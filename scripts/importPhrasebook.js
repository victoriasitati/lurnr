#!/usr/bin/env node
/**
 * Turn the filled-in phrasebook spreadsheet into data/gikuyu/phrasebook.json.
 * In Excel/Google Sheets: open the 'Phrasebook' tab, File > Download/Save as > CSV, then:
 *   node scripts/importPhrasebook.js path/to/phrasebook.csv
 * Columns (in order): category, English, Gikuyu, notes, checked_by. Rows without Gikuyu are skipped.
 */
const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/importPhrasebook.js <phrasebook.csv>');
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).slice(1);
const entries = rows
  .map(([category = '', en = '', kik = '', notes = ''], i) => ({ category: category.trim(), en: en.trim(), kik: kik.trim(), notes: notes.trim() }))
  .filter(e => e.en && e.kik)
  .map(({ en, kik, category, notes }) => (notes ? { en, kik, category, notes } : { en, kik, category }));

const out = path.join(__dirname, '..', 'data', 'gikuyu', 'phrasebook.json');
fs.writeFileSync(out, JSON.stringify(entries, null, 2) + '\n', 'utf8');
console.log(`Wrote ${entries.length} entries (of ${rows.length} rows) to ${out}`);
