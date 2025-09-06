// src/services/drive.js
import { getJSON, getBlob, getText } from "../utils/net.js";

/** List only images in a single folder (no recursion) with paging (1000 per page). */
export async function listDriveImagesFast(
  folderId,
  apiKey,
  { includeSharedDrives = true, excludeShiny = false } = {}
) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const files = [];
  let pageToken;

  do {
    let q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`;
    if (excludeShiny) q += " and not (name contains 'shiny' or name contains 'Shiny' or name contains 'SHINY')";

    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,thumbnailLink,md5Checksum,mimeType,size)",
      pageSize: "1000",
      key: apiKey,
    });
    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const json = await getJSON(`${base}?${params.toString()}`, "listing Drive files");
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    md5: f.md5Checksum || "",
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
    thumbUrl: f.thumbnailLink || null,
  }));
}

/** Try to find `sprite_ref_cache.json` in the folder and return parsed JSON; null if missing. */
export async function tryLoadDriveCacheJSON(folderId, apiKey, { includeSharedDrives = true } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and name = 'sprite_ref_cache.json'`,
    fields: "files(id,name)",
    pageSize: "1",
    key: apiKey,
  });
  if (includeSharedDrives) {
    params.set("supportsAllDrives", "true");
    params.set("includeItemsFromAllDrives", "true");
  }
  const json = await getJSON(`${base}?${params.toString()}`, "finding cache json");
  const file = (json.files || [])[0];
  if (!file) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
  const text = await getText(url, "downloading cache json");
  try { return JSON.parse(text); } catch { return null; }
}
