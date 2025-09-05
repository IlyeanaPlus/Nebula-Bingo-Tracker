// src/services/drive.js
import { getJSON } from "../utils/net.js";

/**
 * List ONLY the top-level of a Drive folder (no recursion).
 * Returns entries with both a fast thumbnail (if available) and a full download URL.
 * Shiny filtering is pushed into the Drive query to avoid listing them at all.
 */
export async function listDriveImagesTop(folderId, apiKey, {
  includeSharedDrives = true,
  excludeShiny = true,
} = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const files = [];
  let pageToken;

  do {
    let q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`;
    if (excludeShiny) {
      q += " and not (name contains 'shiny' or name contains 'Shiny' or name contains 'SHINY')";
    }

    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id,name,mimeType,thumbnailLink)",
      pageSize: "1000",
      key: apiKey,
    });
    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${base}?${params.toString()}`;
    const json = await getJSON(url, "listing Drive files (top-level)");
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);

  return files.map((f) => ({
    id: f.id,
    name: f.name,
    thumbUrl: f.thumbnailLink || null,
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
  }));
}
