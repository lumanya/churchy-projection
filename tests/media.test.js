import { describe, it, expect } from 'vitest';
import { filterMedia, collectionsOf, formatBytes, formatDuration } from '../src/lib/mediaLib.js';

describe('browsing media', () => {
  const media = [
    { id: 'p1', kind: 'image', name: 'Building fund poster', size: 2e6, addedAt: 3, collection: 'Announcements' },
    { id: 'v1', kind: 'video', name: 'Christmas carols', size: 4e8, addedAt: 1, collection: 'Christmas' },
    { id: 'v2', kind: 'video', name: 'Worship loop', size: 5e7, addedAt: 2 },
    { id: 'p2', kind: 'image', name: 'Sunset background', size: 1e6, addedAt: 4 }
  ];
  it('separates pictures and videos', () => {
    expect(filterMedia(media, { kind: 'video' }).map((m) => m.id)).toEqual(['v2', 'v1']);
    expect(filterMedia(media, { kind: 'image' }).map((m) => m.id)).toEqual(['p2', 'p1']);
    expect(filterMedia(media, { kind: 'all' })).toHaveLength(4);
  });
  it('searches names and collections', () => {
    expect(filterMedia(media, { query: 'christ' }).map((m) => m.id)).toEqual(['v1']);
    expect(filterMedia(media, { query: 'announce' }).map((m) => m.id)).toEqual(['p1']);
    expect(filterMedia(media, { query: 'LOOP' }).map((m) => m.id)).toEqual(['v2']);
  });
  it('filters by collection', () => {
    expect(filterMedia(media, { collection: 'Christmas' }).map((m) => m.id)).toEqual(['v1']);
    expect(filterMedia(media, { collection: '*none' }).map((m) => m.id)).toEqual(['p2', 'v2']);
    expect(collectionsOf(media)).toEqual(['Announcements', 'Christmas']);
  });
  it('sorts newest first, by name or by size', () => {
    expect(filterMedia(media, {}).map((m) => m.id)).toEqual(['p2', 'p1', 'v2', 'v1']);
    expect(filterMedia(media, { sort: 'name' }).map((m) => m.id)).toEqual(['p1', 'v1', 'p2', 'v2']);
    expect(filterMedia(media, { sort: 'size' }).map((m) => m.id)).toEqual(['v1', 'v2', 'p1', 'p2']);
  });
  it('formats sizes and lengths', () => {
    expect(formatBytes(5.3e7)).toBe('53 MB');
    expect(formatBytes(4e9)).toBe('4.0 GB');
    expect(formatDuration(222)).toBe('3:42');
  });
});
