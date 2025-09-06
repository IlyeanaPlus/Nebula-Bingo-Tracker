// src/services/drive.js

/**
 * Google Drive service (API-key only; works with publicly readable folders/files).
 * Returns sprites using CORS-friendly image URLs so canvas hashing works.
 */

// ==== Your hardcoded values ====
export const GOOGLE_API_KEY  = 'AIzaSyCTsyJ6Q5fogdMdLTUVnsKOuDdkCnigIE8';
export const DRIVE_FOLDER_ID = '1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB';

// Exclusion terms (server & client)
const EXCLUDE_NAME_CONTAINS = ['shiny'];

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
    } catch {}
  }
  return null;
}

function normalizeDriveList(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  return list.files ?? list.images ?? list.items ?? list.list ?? [];
}

function matchesExclusion(name = '') {
  const n = String(name).toLowerCase();
  return EXCLUDE_NAME_CONTAINS.some((term) => n.includes(term.toLowerCase()));
}

/** Upsize a Drive thumbnailLink to a larger size while staying on lh3.googleusercontent.com */
function upsizeThumb(url) {
  try {
    // Common patterns: ...=s220, ...=w200-h200, a 'sz' query, etc.
    // We attempt a few regex replacements to request ~2048px width.
    let out = url;
    out = out.replace(/=s\d+(-c)?$/i, '=s2048');
    out = out.replace(/=w\d+(-h\d+)?(-p)?$/i, '=w2048');
    // Some variants use ?sz=...
    const u = new URL(out);
    if (u.searchParams.has('sz')) u.searchParams.set('sz', 'w2048');
    return u.toString();
  } catch {
    return url;
  }
}

/** CORS-friendly image URL for hashing/display (prefer lh3 thumbnails) */
function corsImageURL(file) {
  // Prefer thumbnailLink (usually on lh3.googleusercontent.com with CORS)
  if (file.thumbnailLink) return upsizeThumb(file.thumbnailLink);
  // Fallback: known lh3 pattern that serves the binary with CORS
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(file.id)}=w2048`;
}

/** Non-CORS direct download (if ever needed for raw file download) */
function directDownloadURL(fileId, apiKey) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media&key=${encodeURIComponent(apiKey)}`;
}

/**
 * List images in a Drive folder (excludes "shiny").
 * Returns: { files: Array<{ id, name, mimeType, url, downloadUrl, thumbnailLink, webViewLink }> }
 *  - url:  CORS-friendly image URL (use this for <img> and hashing)
 *  - downloadUrl: alt=media URL (no CORS; not for canvas)
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
  if (!apiKey || !folderId) throw new Error('Missing Google Drive API key or folder ID.');

  const files = [];
  let pageToken = '';

  for (let guard = 0; guard < 50; guard++) {
    // Server-side: exclude shinies
    const q =
      `'${folderId}' in parents and trashed=false and ` +
      `mimeType contains 'image/' and not name contains 'shiny'`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)',
      pageSize: '1000',
      key: apiKey,
      // If you need Shared Drives later, you can uncomment:
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
      if (matchesExclusion(f.name)) continue;
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailLink: f.thumbnailLink,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink,
        url: corsImageURL(f),                 // <-- use this for hashing & display
        downloadUrl: directDownloadURL(f.id, apiKey), // <-- not CORS; not for canvas
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { files };
}

/** If you ever ingest a cached JSON, normalize to the same structure (with CORS URLs). */
export function toFileObjectsFromCache(cacheJson) {
  const arr = normalizeDriveList(cacheJson);
  return arr
    .filter((it) => !matchesExclusion(it.name || it.title || it.url))
    .map((it) => {
      const id = it.id || it.fileId || it.name || '';
      const name = it.name || it.title || id || 'image';
      return {
        id,
        name,
        mimeType: it.mimeType || 'image/*',
        thumbnailLink: it.thumbnailLink,
        webViewLink: it.webViewLink,
        webContentLink: it.webContentLink,
        url: it.url ? upsizeThumb(it.url) : corsImageURL({ id, thumbnailLink: it.thumbnailLink }),
        downloadUrl: directDownloadURL(id, getConfiguredDriveInfo().apiKey),
      };
    });
}
