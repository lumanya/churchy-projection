// Organising the church's pictures and videos: filters, search, collections, sizes.

// filter: { kind: 'all'|'image'|'video', query, collection: ''|'*none'|name, sort: 'new'|'name'|'size' }
export function filterMedia(list, filter) {
  const q = (filter.query || '').trim().toLowerCase();
  let out = (list || []).filter((m) => {
    if (filter.kind && filter.kind !== 'all' && m.kind !== filter.kind) return false;
    if (filter.collection === '*none' && m.collection) return false;
    if (filter.collection && filter.collection !== '*none' && m.collection !== filter.collection) return false;
    if (q && !(`${m.name} ${m.collection || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const sort = filter.sort || 'new';
  out = [...out].sort((a, b) => (
    sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'size' ? (b.size || 0) - (a.size || 0)
        : (b.addedAt || 0) - (a.addedAt || 0)
  ));
  return out;
}

export function collectionsOf(list) {
  return [...new Set((list || []).map((m) => m.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function formatBytes(n) {
  if (!n) return '0 MB';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

export function formatDuration(sec) {
  if (!sec || !Number.isFinite(sec)) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
