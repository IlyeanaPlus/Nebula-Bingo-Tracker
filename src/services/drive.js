// src/services/drive.js

/**
 * Google Drive service (API-key only; works with publicly readable folders/files).
 *
 * Exports:
 *  - GOOGLE_API_KEY, DRIVE_FOLDER_ID (hardcoded defaults)
 *  - getConfiguredDriveInfo(): { apiKey, folderId }
 *  - tryLoadDriveCacheJSON(): Promise<object|null>
 *  - listDriveImagesFast([apiKey], [folderId]) | listDriveImagesFast({ apiKey, folderId })
 *
 * Notes:
 *  - With API key, Drive will only list files that are publicly accessible
 *    (folder & files must be "Anyone with the link — Viewer").
 *  - If you use a Shared Drive, public link sharing must be allowed by your org.
 */

// OPTIONAL hardcoded values (leave empty to use runtime config)
export const GOOGLE_API_KEY  = 'AIzaSyCTsyJ6Q5fogdMdLTUVnsKOuDdkCnigIE8'; // e.g. 'AIzaSy...'
export const DRIVE_FOLDER_ID = '1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB';       // e.g. '1AbCDefGh...'

/** Resolve API key and folder ID from (in priority order):
 *  1) hardcoded constants above
 *  2) window.NBT_DRIVE_API_KEY / window.NBT_DRIVE_FOLDER_ID
 *  3) localStorage 'drive:apiKey' | 'google:apiKey' and 'drive:folderId' | 'google:folderId'
 */
export function getConfiguredDriveInfo() {
  const apiKey =
    GOOGLE_API_KEY ||
    (typeof window !== 'undefined' && window.NBT_DRIVE_API_KEY) ||
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('drive:apiKey') || localStorage.getItem('google:apiKey'))) ||
    '';

  const folderId =
    DRIVE_FOLDER_ID ||
    (typeof window !== 'undefined' && window.NBT_DRIVE_FOLDER_ID) ||
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('drive:folderId') || localStorage.getItem('google:folderId'))) ||
    '';

  return { apiKey, folderId };
}

/** Fast-path cache loader; place one of these JSON files in /public:
 *   - drive_cache.json
 *   - sprites.json
 *   - cache/drive.json
 *  Shape can be an array or { files:[...] } / { images:[...] } / etc.
 */
export async function tryLoadDriveCacheJSON() {
  const candidates = [
    'drive_cache.json',
    '/drive_cache.json',
    'sprites.json',
    '/sprites.json',
    '/cache/drive.json',
  ];
  for (const path of candidates) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Normalize various list shapes into a flat array of file-like objects. */
function normalizeDriveList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  return list.files ?? list.images ?? list.items ?? list.list ?? [];
}

/** Build a direct content URL for a file ID using the API key. */
function directContentURL(fileId, apiKey) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media&key=${encodeURIComponent(apiKey)}`;
}

/**
 * List images in a Drive folder.
 * Usage:
 *   await listDriveImagesFast(); // uses getConfiguredDriveInfo()
 *   await listDriveImagesFast(apiKey, folderId);
 *   await listDriveImagesFast({ apiKey, folderId });
 *
 * Returns: { files: Array<{ id, name, mimeType, url, thumbnailLink, webViewLink, webContentLink }> }
 */
export async function listDriveImagesFast(arg1, arg2) {
  let apiKey, folderId;
  if (typeof arg1 === 'object' && arg1) {
    apiKey = arg1.apiKey;
    folderId = arg1.folderId;
  } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    apiKey = arg1;
    folderId = arg2;
  } else {
    ({ apiKey, folderId } = getConfiguredDriveInfo());
  }

  if (!apiKey || !folderId) {
    throw new Error('Missing Google Drive API key or folder ID.');
  }

  const files = [];
  let pageToken = '';

  // Safely encode parameters with URLSearchParams to avoid malformed URLs (400s).
  for (let guard = 0; guard < 50; guard++) {
    const q = `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)',
      pageSize: '1000',
      key: apiKey,
      // Minimal flags for public folders. If you need Shared Drives, uncomment below:
      // includeItemsFromAllDrives: 'true',
      // supportsAllDrives: 'true',
      // corpora: 'allDrives',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

    let data;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch {}
        throw new Error(`Drive list error ${res.status}${detail ? `: ${detail}` : ''}`);
      }
      data = await res.json();
    } catch (e) {
      throw e;
    }

    const got = Array.isArray(data.files) ? data.files : [];
    for (const f of got) {
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailLink: f.thumbnailLink,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink,
        url: directContentURL(f.id, apiKey),
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { files };
}

/* -------- Optional helper: adapt external cache shapes to the same result ------- */
export function toFileObjectsFromCache(cacheJson) {
  const arr = normalizeDriveList(cacheJson);
  return arr.map((it) => {
    const id = it.id || it.fileId || it.name || '';
    const name = it.name || it.title || id || 'image';
    const url =
      it.url ||
      it.webContentLink ||
      (id ? directContentURL(id, getConfiguredDriveInfo().apiKey) : '');
    return {
      id,
      name,
      mimeType: it.mimeType || 'image/*',
      thumbnailLink: it.thumbnailLink,
      webViewLink: it.webViewLink,
      webContentLink: it.webContentLink,
      url,
    };
  });
}
