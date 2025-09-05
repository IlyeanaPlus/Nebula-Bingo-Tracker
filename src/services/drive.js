import { getJSON } from '../utils/net';
import { isShinyName } from '../utils/names';

export async function listDriveImages(folderId, apiKey, { includeSharedDrives = true, excludeShiny = false } = {}) {
  const base = "https://www.googleapis.com/drive/v3/files";
  const files = [];
  let pageToken = undefined;
  do {
    let q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/')`;
    if (excludeShiny) q += " and not (name contains 'shiny' or name contains 'Shiny' or name contains 'SHINY')";
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
    files.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  const filtered = excludeShiny ? files.filter((f) => !isShinyName(f.name)) : files;
  return filtered.map((f) => ({
    id: f.id,
    name: f.name,
    downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
  }));
}
