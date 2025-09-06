// src/services/drive.js

/**
 * Central point for Google Drive access.
 * - Set GOOGLE_API_KEY / DRIVE_FOLDER_ID below (optional).
 * - Or provide them at runtime:
 *   - window.NBT_DRIVE_API_KEY / window.NBT_DRIVE_FOLDER_ID
 *   - localStorage: drive:apiKey / drive:folderId (or google:apiKey / google:folderId)
 *
 * Exports:
 * - getConfiguredDriveInfo(): { apiKey, folderId }
 * - tryLoadDriveCacheJSON(): tries to load a cached JSON list from the app (fast path)
 * - listDriveImagesFast(): list images from a Drive folder (0-arg uses configured key/folder)
 */

// OPTIONAL hardcoded values (leave empty to use runtime config)
export const GOOGLE_API_KEY = '';     // e.g. 'AIzaSy...'
export const DRIVE_FOLDER_ID = '';    // e.g. '1AbCDefGh...'

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

/**
 * tryLoadDriveCacheJSON()
 * Attempts to fetch a prebuilt JSON (fast path) from the app's public assets.
 * Return value is the parsed JSON or null if not found.
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
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * listDriveImagesFast([apiKey], [folderId]) or listDriveImagesFast({ apiKey, folderId })
 * If called with no args, it uses getConfiguredDriveInfo().
 *
 * Returns an object: { files: Array<DriveFileLike> }
 * Each file includes: id, name, url (direct content), thumbnailLink, webViewLink, webContentLink, mimeType
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
    const cfg = getConfiguredDriveInfo();
    apiKey = cfg.apiKey;
    folderId = cfg.folderId;
  }

  if (!apiKey || !folderId) {
    throw new Error('Missing Google Drive API key or folder ID.');
  }

  const base = 'https://www.googleapis.com/drive/v3/files';
  const q = `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`;
  const fields = [
    'nextPageToken',
    'files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)',
  ].join(',');

  let pageToken = '';
  const files = [];

  // paginate until done
  for (let guard = 0; guard < 50; guard++) {
    const url =
      `${base}?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '') +
      `&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives` +
      `&key=${encodeURIComponent(apiKey)}`;

    let data;
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`Drive list error ${res.status}`);
      data = await res.json();
    } catch (e) {
      // If listing fails, bail with what we have so far (or rethrow)
      throw e;
    }

    const got = Array.isArray(data.files) ? data.files : [];
    for (const f of got) {
      // Build a direct content URL that works with API key
      const directURL = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        f.id
      )}?alt=media&key=${encodeURIComponent(apiKey)}`;

      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailLink: f.thumbnailLink,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink,
        url: directURL,
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { files };
}
