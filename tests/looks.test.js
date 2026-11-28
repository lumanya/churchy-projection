import { describe, it, expect } from 'vitest';
import { LOOKS, applyLook, activeLook, fontOf, slideKey, lookById } from '../src/lib/looks.js';
import { slidesFor } from '../src/lib/slides.js';

describe('projector looks', () => {
  it('each look has readable colours, a typeface and both language names', () => {
    for (const l of LOOKS) {
      expect(l.name.en && l.name.sw).toBeTruthy();
      expect(l.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(l.fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(['sans', 'serif', 'display']).toContain(l.font);
    }
    expect(new Set(LOOKS.map((l) => l.id)).size).toBe(LOOKS.length);
  });

  it('choosing a look changes colours and typeface but keeps the church\'s other choices', () => {
    const t = applyLook({ bg: '#000000', fg: '#fff', accent: '#f00', dual: 'side', transition: 'cut', bgMedia: 'm1', dim: 0.3 }, 'royal');
    expect(t).toMatchObject({ look: 'royal', bg: '#0D0614', font: 'serif', dual: 'side', transition: 'cut', bgMedia: 'm1', dim: 0.3 });
    expect(applyLook({ a: 1 }, 'nope')).toEqual({ a: 1 });
  });

  it('shows the designed background only while the look\'s own background colour is kept', () => {
    const t = applyLook({}, 'sunrise');
    expect(activeLook(t).id).toBe('sunrise');
    expect(activeLook({ ...t, bg: '#123456' })).toBeNull();
    expect(activeLook(applyLook({}, 'classic'))).toBeNull(); // plain colour, nothing to draw
    expect(fontOf({ font: 'serif' })).toMatch(/Source Serif/);
    expect(fontOf({})).toMatch(/Atkinson/);
    expect(lookById('parchment').light).toBe(true);
  });

  it('knows when a slide changed, so it can fade', () => {
    expect(slideKey({ text: 'a', ref: 'x' })).not.toBe(slideKey({ text: 'b', ref: 'x' }));
    expect(slideKey({ text: 'a' })).toBe(slideKey({ text: 'a' }));
    expect(slideKey(null)).toBe('');
  });
});

describe('two translations on a verse slide', () => {
  const bible = (id, short, text) => ({ id, short, name: short, lang: id === 'neno' ? 'sw' : 'en', books: { JHN: [[], [], Array.from({ length: 16 }, (_, i) => (i === 15 ? text : 'v' + (i + 1)))] } });
  const bibles = { neno: { ...bible('neno', 'NENO', 'Kwa maana jinsi hii Mungu aliupenda ulimwengu'), credit: '© Biblica, Inc. · CC BY-SA 4.0' }, kjv: bible('kjv', 'KJV', 'For God so loved the world') };
  const item = { type: 'bible', ref: { bibleId: 'neno', book: 'JHN', chapter: 3, from: 16, to: 16 } };

  it('names the main version first and the second after it', () => {
    const [s] = slidesFor(item, { songs: [], notices: [], bibles, settings: { secondBible: 'kjv' }, media: [] });
    expect(s.text).toMatch(/^Kwa maana/);
    expect(s.sub).toBe('For God so loved the world');
    expect(s.versions).toEqual(['NENO', 'KJV']);
    expect(s.credit).toBe('© Biblica, Inc. · CC BY-SA 4.0');
  });

  it('has one version name without a second translation', () => {
    const [s] = slidesFor(item, { songs: [], notices: [], bibles, settings: { secondBible: '' }, media: [] });
    expect(s.versions).toEqual(['NENO']);
    expect(s.sub).toBeNull();
  });
});
