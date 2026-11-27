// Minimal RTF → plain text, enough for song lyrics (EasyWorship stores each song as RTF).
// Keeps paragraphs and line breaks, decodes \'hh (Windows-1252) and \uN, drops fonts, colours and hidden groups.
const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'latentstyles', 'datastore']);

export function rtfToText(rtf) {
  if (!rtf) return '';
  if (!/^\s*\{\\rtf/.test(rtf)) return String(rtf); // already plain text
  let out = '';
  let i = 0;
  const stack = [];
  let skip = false;
  let uc = 1;          // characters to drop after \uN
  let pendingSkip = 0;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') { stack.push({ skip, uc }); i++; continue; }
    if (c === '}') { const s = stack.pop(); if (s) { skip = s.skip; uc = s.uc; } i++; continue; }
    if (c === '\\') {
      const next = rtf[i + 1];
      if (next === '\\' || next === '{' || next === '}') { if (!skip) out += next; i += 2; continue; }
      if (next === '~') { if (!skip) out += ' '; i += 2; continue; }
      if (next === '*') { skip = true; i += 2; continue; }
      if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        if (pendingSkip > 0) pendingSkip--;
        else if (!skip && !Number.isNaN(code)) out += CP1252[code] || String.fromCharCode(code);
        i += 4; continue;
      }
      if (next === '\n' || next === '\r') { if (!skip) out += '\n'; i += 2; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!m) { i++; continue; }
      const word = m[1];
      const arg = m[2] !== undefined ? parseInt(m[2], 10) : null;
      i += m[0].length;
      if (SKIP.has(word)) { skip = true; continue; }
      if (skip) continue;
      if (word === 'par' || word === 'line' || word === 'sect') out += '\n';
      else if (word === 'tab') out += ' ';
      else if (word === 'uc' && arg !== null) uc = arg;
      else if (word === 'u' && arg !== null) { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); pendingSkip = uc; }
      else if (word === 'emdash') out += '—';
      else if (word === 'endash') out += '–';
      else if (word === 'lquote') out += '‘';
      else if (word === 'rquote') out += '’';
      else if (word === 'ldblquote') out += '“';
      else if (word === 'rdblquote') out += '”';
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (pendingSkip > 0) { pendingSkip--; i++; continue; }
    if (!skip) out += c;
    i++;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
