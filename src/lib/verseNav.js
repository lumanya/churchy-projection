// Reading on past the end of a passage, or back before its start.
// A passage is { book, chapter, from, to } in one chapter.

const versesIn = (bible, book, chapter) => ((bible && bible.books[book]) || [])[chapter - 1] || [];

// The next verse after the passage:
//   { kind: 'extend', ref }  the passage grows by one verse (John 3:16 → John 3:16-17)
//   { kind: 'chapter', ref } the chapter ended: the first verse of the next chapter, as a new passage
//   null                     the book ended
export function nextVerseRef(bible, ref) {
  if (!bible || !ref) return null;
  const count = versesIn(bible, ref.book, ref.chapter).length;
  const to = Math.min(ref.to || count, count);
  if (to < count) return { kind: 'extend', ref: { ...ref, to: to + 1 } };
  if (versesIn(bible, ref.book, ref.chapter + 1).length) return { kind: 'chapter', ref: { ...ref, chapter: ref.chapter + 1, from: 1, to: 1 } };
  return null;
}

// The verse before the passage, in the same chapter: the passage grows backwards (John 3:16 → John 3:15-16)
export function prevVerseRef(ref) {
  if (!ref || (ref.from || 1) <= 1) return null;
  return { ...ref, from: ref.from - 1 };
}

// just the one verse that reading on would show next
export function nextVerseOnly(bible, ref) {
  const nx = nextVerseRef(bible, ref);
  if (!nx) return null;
  const v = nx.kind === 'extend' ? nx.ref.to : 1;
  return { ...nx.ref, from: v, to: v };
}
