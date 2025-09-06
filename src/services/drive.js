// src/services/drive.js
// Public Google Drive helpers (API key + "Anyone with the link" folder)
// NOTE: API key-only access can READ public files but cannot WRITE.

import { getJSON, getBlob } from '../utils/net.js';

function qEncode(s) {
  // escape single quotes inside the q string for Drive
  return String(s).replace(/'/g, "\\'");
}

/**
 * List image files in a single (top-level) Drive folder.
 * Fast path: request `thumbnailLink` so we can hash the thumb first.
 */
export async function listDriveImagesTop(folderId, apiKey, {
  includeSharedDrives = true,
  excludeShiny = true,
  pageSize = 1000
} = {}) {
  const base = 'https://www.googleapis.com/drive/v3/files';
  const files = [];
  let pageToken;

  do {
    let q = `'${qEncode(folderId)}' in parents and trashed=false and (mimeType contains 'image/')`;
    if (excludeShiny) q += ` and not (name contains 'shiny' or name contains 'Shiny' or name contains 'SHINY')`;

    const params = new URLSearchParams({
      q,
      pageSize: String(pageSize),
      // include thumbnailLink for faster hashing
      fields: 'nextPageToken, files(id,name,mimeType,thumbnailLink)',
      key: apiKey
    });
    if (includeSharedDrives) {
      params.set('supportsAllDrives', 'true');
      params.set('includeItemsFromAllDrives', 'true');
    }
    if (pageToken) params.set('pageToken', pageToken);

    const url = `${base}?${params.toString()}`;
    const json = await getJSON(url, 'listing Drive files');
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return files.map(f => ({
    id: f.id,
    name: f.name,
    thumbUrl: f.thumbnailLink || null,
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`
  }));
}

/**
 * Look for a JSON cache named exactly `sprite_ref_cache.json` in the folder,
 * download and parse it. Returns { cache: object|null, fileId: string|null }.
 */
export async function fetchDriveCacheJSON(folderId, apiKey, { includeSharedDrives = true } = {}) {
  const base = 'https://www.googleapis.com/drive/v3/files';
  const q = `'${qEncode(folderId)}' in parents and trashed=false and name='sprite_ref_cache.json' and mimeType='application/json'`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType)',
    pageSize: '1',
    key: apiKey
  });
  if (includeSharedDrives) {
    params.set('supportsAllDrives', 'true');
    params.set('includeItemsFromAllDrives', 'true');
  }
  const url = `${base}?${params.toString()}`;
  const list = await getJSON(url, 'searching for cache json');
  const f = (list.files || [])[0];
  if (!f) return { cache: null, fileId: null };

  const dl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`;
  const blob = await getBlob(dl, 'downloading cache json');
  const text = await blob.text();
  try {
    const parsed = JSON.parse(text);
    return { cache: parsed, fileId: f.id };
  } catch {
    return { cache: null, fileId: f.id };
  }
}
