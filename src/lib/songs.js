// Songs are stored as plain text. Sections are separated by a blank line.
// A section may start with a label line such as "[Verse 1]", "Chorus:", "Ubeti 2", "Kiitikio".
const LABEL_WORDS = /^(verse|chorus|refrain|bridge|pre-?chorus|tag|intro|ending|ubeti|kiitikio|kibwagizo|daraja)\b/i;

export function parseLyrics(text) {
  const blocks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  let verseNo = 0;
  return blocks.map((block) => {
    const lines = block.split('\n').map((l) => l.trim());
    let label = null;
    const first = lines[0];
    const bracket = first.match(/^\[(.+)\]$/);
    if (bracket) { label = bracket[1].trim(); lines.shift(); }
    else if (LABEL_WORDS.test(first) && first.length <= 24) { label = first.replace(/:$/, '').trim(); lines.shift(); }
    if (!label) { verseNo += 1; label = `Verse ${verseNo}`; }
    else if (/^(verse|ubeti)/i.test(label)) verseNo += 1;
    return { label, text: lines.join('\n') };
  }).filter((s) => s.text);
}

// Long sections are split so no slide has more than maxLines lines.
export function songSlides(song, maxLines = 4) {
  const out = [];
  for (const sec of parseLyrics(song.lyrics)) {
    const lines = sec.text.split('\n');
    if (lines.length <= maxLines) { out.push({ label: sec.label, text: sec.text }); continue; }
    const parts = Math.ceil(lines.length / maxLines);
    const per = Math.ceil(lines.length / parts);
    for (let i = 0; i < parts; i++) {
      out.push({ label: `${sec.label} (${i + 1}/${parts})`, text: lines.slice(i * per, (i + 1) * per).join('\n') });
    }
  }
  return out;
}

// Plain text import: first line is the title, the rest are lyrics.
export function parsePlainSong(text, fallbackTitle = 'Untitled') {
  const t = String(text).replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const [first, ...rest] = t.split('\n');
  const title = (first || '').replace(/^title:\s*/i, '').trim() || fallbackTitle;
  return { title, lyrics: rest.join('\n').trim() };
}

// OpenLyrics XML, the format OpenLP and others export.
export function parseOpenLyrics(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This song file could not be read.');
  const title = (doc.getElementsByTagName('title')[0]?.textContent || 'Untitled').trim();
  const songbook = doc.getElementsByTagName('songbook')[0];
  const verses = Array.from(doc.getElementsByTagName('verse')).map((v) => {
    const name = v.getAttribute('name') || '';
    const kind = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-chorus', e: 'Ending', i: 'Intro' }[name[0]] || 'Verse';
    const label = `${kind}${name.slice(1) ? ' ' + name.slice(1).replace(/[a-z]$/, '') : ''}`;
    const lines = Array.from(v.getElementsByTagName('lines')).map((l) => {
      // <br/> marks line breaks; chords and comments are dropped
      const html = new XMLSerializer().serializeToString(l)
        .replace(/<br\s*\/?>/g, '\n').replace(/<comment>[\s\S]*?<\/comment>/g, '').replace(/<[^>]+>/g, '');
      return html.split('\n').map((s) => s.trim()).filter(Boolean).join('\n');
    }).join('\n');
    return `[${label}]\n${lines}`;
  });
  return {
    title,
    book: songbook?.getAttribute('name') || '',
    number: songbook?.getAttribute('entry') || '',
    lyrics: verses.join('\n\n')
  };
}
