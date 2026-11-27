import { songSlides } from './songs.js';
import { getVerses, formatReference } from './bibleRef.js';

// Builds the slides for one item in the order of service.
// A slide is { label, text, sub?, ref? } — ref is the line shown at the bottom of the screen.
export function slidesFor(item, { songs, notices, bibles, settings }) {
  if (!item) return [];
  if (item.type === 'song') {
    const song = songs.find((s) => s.id === item.refId);
    if (!song) return [{ label: 'Missing song', text: item.title }];
    return songSlides(song, settings.maxLines || 4).map((s) => ({ ...s, ref: song.title }));
  }
  if (item.type === 'bible') {
    const main = bibles[item.ref.bibleId] || Object.values(bibles)[0];
    const second = settings.secondBible ? bibles[settings.secondBible] : null;
    const verses = getVerses(main, item.ref);
    const lang = main?.lang === 'sw' ? 'sw' : 'en';
    return verses.map((v) => {
      const other = second && second !== main ? getVerses(second, { ...item.ref, from: v.n, to: v.n })[0] : null;
      return {
        label: `${item.ref.chapter}:${v.n}`,
        text: v.text,
        sub: other ? other.text : null,
        ref: `${formatReference({ ...item.ref, from: v.n, to: v.n }, lang)} · ${main.short || main.name}${other ? ' · ' + (second.short || second.name) : ''}`
      };
    });
  }
  if (item.type === 'notice') {
    const n = notices.find((x) => x.id === item.refId);
    if (!n) return [{ label: 'Missing notice', text: item.title }];
    const parts = String(n.body || '').split(/\n\s*---\s*\n/);
    return parts.map((p, i) => ({ label: parts.length > 1 ? `Slide ${i + 1}` : 'Notice', title: n.title, text: p.trim() }));
  }
  if (item.type === 'text') {
    return [{ label: 'Text', text: item.title }];
  }
  return [];
}
