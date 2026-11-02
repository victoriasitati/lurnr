#!/usr/bin/env node
/**
 * Build data/gikuyu/bible_parallel.jsonl from two USFM packs.
 *
 *   Gikuyu: Biblica Open Kikuyu Holy Word of God (CC BY-SA 4.0)  https://ebible.org/Scriptures/kik_usfm.zip
 *   English: World English Bible (public domain)                  https://ebible.org/Scriptures/engwebp_usfm.zip
 *
 * Usage: node scripts/buildGikuyuParallel.js <kikUsfmDir> <engUsfmDir> [outFile]
 */
const fs = require('fs');
const path = require('path');

const BOOKS = ('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM ' +
  'EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL ' +
  '1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV').split(' ');

// Paragraph/heading markers whose text is not part of a verse.
const NON_VERSE = /^(id|ide|h|toc\d|mt\d?|mte\d?|ms\d?|mr|s\d?|sr|r|rem|d|sp|cl|cd|periph|b|c|cp|ca|va|vp)$/;

function findFile(dir, code) {
  const re = new RegExp(`^\\d+-${code}.*\\.usfm$`, 'i');
  const hit = fs.readdirSync(dir).find(f => re.test(f));
  return hit ? path.join(dir, hit) : null;
}

function cleanInline(text) {
  return text
    .replace(/\\\+?w\s+([^|\\]*?)(\|[^\\]*)?\\\+?w\*/g, '$1') // \w word|strong="H1"\w*  (or nested \+w)  ->  word
    .replace(/\\\+?[a-z]+\d?\*?/gi, '')                    // remaining inline markers, keep their content
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse one USFM file into Map<"chapter:verse", text>. */
function parseUsfm(file) {
  let raw = fs.readFileSync(file, 'utf8');
  raw = raw
    .replace(/\\f\s.*?\\f\*/gs, '')   // footnotes
    .replace(/\\x\s.*?\\x\*/gs, '')   // cross references
    .replace(/\\fig\s.*?\\fig\*/gs, '');

  const verses = new Map();
  let chapter = null;
  let current = null; // key of the verse still collecting text

  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\\([a-z0-9]+)\*?\s?(.*)$/i);
    if (!m) continue;
    const [, marker, rest] = m;

    if (marker === 'c') {
      chapter = parseInt(rest, 10);
      current = null;
      continue;
    }
    if (NON_VERSE.test(marker)) {
      current = null;
      continue;
    }

    // Split the line on inline \v markers; text before the first one continues the open verse.
    const parts = (marker === 'v' ? `\\v ${rest}` : rest).split(/(?=\\v\s)/);
    for (const part of parts) {
      const vm = part.match(/^\\v\s+(\S+)\s?(.*)$/s);
      if (vm && chapter !== null) {
        current = `${chapter}:${vm[1]}`;
        verses.set(current, vm[2]);
      } else if (current) {
        verses.set(current, `${verses.get(current)} ${part}`);
      }
    }
  }

  for (const [k, v] of verses) verses.set(k, cleanInline(v));
  return verses;
}

function main() {
  const [kikDir, engDir, outArg] = process.argv.slice(2);
  if (!kikDir || !engDir) {
    console.error('Usage: node scripts/buildGikuyuParallel.js <kikUsfmDir> <engUsfmDir> [outFile]');
    process.exit(1);
  }
  const outFile = outArg || path.join(__dirname, '..', 'data', 'gikuyu', 'bible_parallel.jsonl');

  const lines = [];
  const skipped = [];
  let kikTotal = 0;
  let engTotal = 0;
  const diacritics = { src: 0, out: 0 };
  const countDia = s => (s.match(/[ĩũĨŨ]/g) || []).length;

  for (const code of BOOKS) {
    const kf = findFile(kikDir, code);
    const ef = findFile(engDir, code);
    if (!kf || !ef) {
      skipped.push(`${code}: whole book (missing ${!kf ? 'Gikuyu' : 'English'} file)`);
      continue;
    }
    const kik = parseUsfm(kf);
    const eng = parseUsfm(ef);
    kikTotal += kik.size;
    engTotal += eng.size;

    for (const [key, ktext] of kik) {
      diacritics.src += countDia(ktext);
      const etext = eng.get(key);
      if (!etext) { skipped.push(`${code} ${key}: no English verse`); continue; }
      if (!ktext) { skipped.push(`${code} ${key}: empty Gikuyu text`); continue; }
      diacritics.out += countDia(ktext);
      lines.push(JSON.stringify({ ref: `${code} ${key}`, kik: ktext, en: etext }));
    }
    for (const key of eng.keys()) {
      if (!kik.has(key)) skipped.push(`${code} ${key}: no Gikuyu verse`);
    }
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');

  console.log(`Gikuyu verses parsed: ${kikTotal}`);
  console.log(`English verses parsed: ${engTotal}`);
  console.log(`Aligned pairs written: ${lines.length} -> ${outFile}`);
  console.log(`Skipped: ${skipped.length}`);
  skipped.forEach(s => console.log(`  - ${s}`));
  console.log(`ĩ/ũ characters in parsed Gikuyu text: ${diacritics.src}, in aligned output: ${diacritics.out}`);

  console.log('\n5 random pairs:');
  for (let i = 0; i < 5; i++) {
    console.log(lines[Math.floor(Math.random() * lines.length)]);
  }
}

main();
