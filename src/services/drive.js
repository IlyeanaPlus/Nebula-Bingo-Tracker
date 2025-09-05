import { getJSON, getBlob } from '../utils/net.js';
import { isShinyName } from '../utils/names.js';

/**
 * listDriveImagesDeep
 * Recursively lists images in a Drive folder and subfolders.
 * Requires: public folder + API key (read-only).
 */
export async function listDriveImagesDeep(folderId, apiKey, {
  includeSharedDrives = true,
  excludeShiny = false,
  onPage = () => {}
} = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";

  async function listOnce(q, pageToken) {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageSize: "1000",
      key: apiKey,
    });
    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${base}?${params.toString()}`;
    return await getJSON(url, "listing Drive files");
  }

  let stack = [folderId];
  const out = [];
  let seenCount = 0;

  while (stack.length) {
    const fid = stack.pop();
    // List files in this folder
    let pageToken = undefined;
    do {
      const q = `'${fid}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/vnd.google-apps.folder')`;
      const json = await listOnce(q, pageToken);
      const files = json.files || [];
      for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          stack.push(f.id);
        } else {
          if (excludeShiny && isShinyName(f.name)) continue;
          out.push({
            id: f.id,
            name: f.name,
            downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
          });
        }
      }
      seenCount += files.length;
      onPage(seenCount);
      pageToken = json.nextPageToken;
    } while (pageToken);
  }

  return out;
}

/**
 * loadDriveCacheJSON
 * Looks for sprite_ref_cache.json in the root folder (non-recursive for safety/perf).
 * Returns parsed JSON or null.
 */
export async function loadDriveCacheJSON(folderId, apiKey, { includeSharedDrives = true } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and name='sprite_ref_cache.json' and mimeType='application/json'`,
    fields: "files(id,name)",
    pageSize: "1",
    key: apiKey,
  });
  if (includeSharedDrives) {
    params.set("supportsAllDrives", "true");
    params.set("includeItemsFromAllDrives", "true");
  }
  const url = `${base}?${params.toString()}`;
  const meta = await getJSON(url, "searching for cache json");
  const hit = (meta.files || [])[0];
  if (!hit) return null;
  const dl = `https://www.googleapis.com/drive/v3/files/${hit.id}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const blob = await getBlob(dl, "downloading cache json");
  const text = await blob.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// NOTE: Uploading/writing to Drive requires OAuth; API key alone cannot write.
// You can implement OAuth (Google Identity Services) and then POST multipart/form-data
// to files.create with uploadType=multipart using the OAuth access token.
