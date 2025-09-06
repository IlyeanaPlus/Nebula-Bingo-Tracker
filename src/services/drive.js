// src/services/drive.js

/**
 * Google Drive service (API-key only; works with publicly readable folders/files).
 *
 * Exports:
 *  - getConfiguredDriveInfo()
 *  - tryLoadDriveCacheJSON()
 *  - listDriveImagesFast([apiKey], [folderId]) | listDriveImagesFast({ apiKey, folderId })
 */

// ==== Your hardcoded values ====
export const GOOGLE_API_KEY  = 'AIzaSyCTsyJ6Q5fogdMdLTUVnsKOuDdkCnigIE8';
export const DRIVE_FOLDER_ID = '1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB';

// Name filters applied server-side (Drive query) and client-side (extra safety)
const EXCLUDE_NAME_CONTAINS = ['shiny']; // add more terms if needed

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

function directContentURL(fileId, apiKey) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media&key=${encodeURIComponent(apiKey)}`;
}

function matchesExclusion(name = '') {
  const n = String(name).toLowerCase();
  return EXCLUDE_NAME_CONTAINS.some((term) => n.includes(term.toLowerCase()));
}

/**
 * List images in a Drive folder (excludes shinies).
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
  if (!apiKey || !folderId) throw new Error('Missing Google Drive API key or folder ID.');

  const files = [];
  let pageToken = '';

  for (let guard = 0; guard < 50; guard++) {
    // Server-side filter: exclude names containing "shiny"
    const q =
      `'${folderId}' in parents and trashed=false and ` +
      `mimeType contains 'image/' and not name contains 'shiny'`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)',
      pageSize: '1000',
      key: apiKey,
      // Uncomment if you need Shared Drives:
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
      // Client-side safety filter too
      if (matchesExclusion(f.name)) continue;
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

// Optional helper to adapt a cached list to same shape (with exclusion)
export function toFileObjectsFromCache(cacheJson) {
  const arr = normalizeDriveList(cacheJson);
  return arr
    .filter((it) => !matchesExclusion(it.name || it.title || it.url))
    .map((it) => {
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
