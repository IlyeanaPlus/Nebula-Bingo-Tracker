// src/services/drive.js
import { getJSON, getBlob } from "../utils/net.js";

/**
 * List all image files in a folder (and recursively in subfolders if desired).
 * Returns: [{ id, name, downloadUrl }]
 */
export async function listDriveImagesDeep(
  folderId,
  apiKey,
  { includeSharedDrives = true, excludeShiny = false, recurse = true, max = Infinity } = {}
) {
  const images = [];
  const toVisit = [folderId];

  while (toVisit.length && images.length < max) {
    const fid = toVisit.shift();

    // 1) List images in this folder
    const imgQ = `'${fid}' in parents and trashed=false and (mimeType contains 'image/')`;
    const imgFiles = await listPaged(fid, apiKey, imgQ, includeSharedDrives);
    for (const f of imgFiles) {
      if (excludeShiny && isShinyName(f.name)) continue;
      images.push({
        id: f.id,
        name: f.name,
        downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
      });
      if (images.length >= max) break;
    }
    if (!recurse || images.length >= max) continue;

    // 2) Enqueue subfolders
    const folQ = `'${fid}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`;
    const folders = await listPaged(fid, apiKey, folQ, includeSharedDrives);
    for (const sf of folders) toVisit.push(sf.id);
  }

  return images;
}

/**
 * Find a specific file by exact name within a folder (public read via API key).
 * Returns minimal file object or null.
 */
export async function findFileInFolderPublic(folderId, apiKey, name, includeSharedDrives = true) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const q = `'${folderId}' in parents and trashed=false and name='${name.replace(/'/g, "\\'")}'`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,modifiedTime,size)",
    pageSize: "1",
    key: apiKey,
  });
  if (includeSharedDrives) {
    params.set("supportsAllDrives", "true");
    params.set("includeItemsFromAllDrives", "true");
  }
  const url = `${base}?${params.toString()}`;
  const json = await getJSON(url, "searching cache.json in Drive");
  return json.files?.[0] || null;
}

/** Download a text file (public) by id using API key. */
export async function downloadTextPublic(fileId, apiKey) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const blob = await getBlob(url, "downloading cache.json");
  return blob.text();
}

// ---------- internal helpers ----------

async function listPaged(_folderId, apiKey, q, includeSharedDrives) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const all = [];
  let pageToken;
  do {
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
    const json = await getJSON(url, "listing Drive files");
    all.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return all;
}

// Minimal shiny filter helper (same semantics as in names.js, but kept local to avoid circular deps)
function isShinyName(stem) {
  if (!stem) return false;
  const s = String(stem).toLowerCase().replace(/[._-]+/g, " ");
  return /\bshiny\b/.test(s);
}
