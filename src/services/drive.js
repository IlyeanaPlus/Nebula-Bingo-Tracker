// Minimal: load a local manifest if present.
// Tries a few common paths; returns parsed JSON or null.
export async function tryLoadDriveCacheJSON() {
  const candidates = [
    '/drive_cache.json',
    'drive_cache.json',
    '/sprites.json',
    'sprites.json',
    '/cache/drive.json',
  ];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      return json;
    } catch {
      // try next
    }
  }
  return null;
}
