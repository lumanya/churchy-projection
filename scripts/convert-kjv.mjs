// One-off: converts the public-domain KJV (thiagobodruk/bible, array format) into Mwanga's format.
// Usage: node scripts/convert-kjv.mjs path/to/en_kjv.json
import fs from 'node:fs';
import { BOOKS } from '../src/lib/books.js';

const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));
if (src.length !== 66) throw new Error('expected 66 books');
const books = {};
src.forEach((b, i) => { books[BOOKS[i].id] = b.chapters.map((ch) => ch.map((v) => v.trim())); });
const out = { id: 'kjv', name: 'King James Version', short: 'KJV', lang: 'en', licence: 'Public domain', books };
fs.mkdirSync('data/bibles', { recursive: true });
fs.writeFileSync('data/bibles/kjv.json', JSON.stringify(out));
console.log('wrote data/bibles/kjv.json');
