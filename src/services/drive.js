// services/drive.js
import { getJSON } from "../utils/net";
import { isShinyName } from "../utils/names";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3/files";

async function listPage(params) {
  const url = `${DRIVE_BASE}?${params.toString()}`;
  return await getJSON(url, "Drive list");
}

export async function listDriveImagesDeep(folderId, apiKey, {
  includeSharedDrives = true,
  excludeShiny = false,
  recurse = true,
  max = Infinity,
  onProgress,
} = {}) {

  const queue = [folderId];
  const files = [];
  let visited = new Set();

  while (queue.length) {
    const fid = queue.shift();
    if (visited.has(fid)) continue;
    visited.add(fid);

    let pageToken = undefined;
    do {
      let q = `'${fid}' in parents and trashed=false`;
      const fields = "nextPageToken, files(id,name,mimeType)";
      const params = new URLSearchParams({
        q,
        fields,
        pageSize: "1000",
        key: apiKey,
      });
      if (includeSharedDrives) {
        params.set("supportsAllDrives", "true");
        params.set("includeItemsFromAllDrives", "true");
      }
      if (pageToken) params.set("pageToken", pageToken);

      const json = await listPage(params);
      for (const f of (json.files || [])) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          if (recurse) queue.push(f.id);
          continue;
        }
        if (!String(f.mimeType || "").startsWith("image/")) continue;
        if (excludeShiny && isShinyName(f.name)) continue;
        files.push({
          id: f.id,
          name: f.name,
          downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
        });
        if (typeof onProgress === "function") onProgress({ type: "file", count: files.length });
        if (files.length >= max) return files;
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
  }
  return files;
}

export async function findDriveFileDeepByNames(folderId, apiKey, names = ["sprite_ref_cache.json", "cache.json"], {
  includeSharedDrives = true,
  recurse = true,
} = {}) {
  const queue = [folderId];
  const visited = new Set();
  while (queue.length) {
    const fid = queue.shift();
    if (visited.has(fid)) continue;
    visited.add(fid);

    let pageToken = undefined;
    do {
      const params = new URLSearchParams({
        q: `'${fid}' in parents and trashed=false`,
        fields: "nextPageToken, files(id,name,mimeType)",
        pageSize: "1000",
        key: apiKey,
      });
      if (includeSharedDrives) {
        params.set("supportsAllDrives", "true");
        params.set("includeItemsFromAllDrives", "true");
      }
      if (pageToken) params.set("pageToken", pageToken);
      const json = await listPage(params);
      for (const f of (json.files || [])) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          if (recurse) queue.push(f.id);
          continue;
        }
        if (names.includes(f.name)) {
          return {
            id: f.id,
            name: f.name,
            downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
          };
        }
      }
      pageToken = json.nextPageToken;
    } while (pageToken);
  }
  return null;
}

export async function loadDriveCacheJSONDeep(folderId, apiKey, opts = {}) {
  const hit = await findDriveFileDeepByNames(folderId, apiKey, undefined, opts);
  if (!hit) return null;
  const url = `https://www.googleapis.com/drive/v3/files/${hit.id}?alt=media&key=${apiKey}`;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const json = await res.json();
    return { name: hit.name, json };
  } catch {
    return null;
  }
}
